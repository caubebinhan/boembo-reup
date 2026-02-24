import { nodeRegistry } from '../nodes/NodeRegistry'
import { JobQueue, JobRecord } from '../../main/db/JobQueue'
import { db } from '../../main/db/Database'
import { flowLoader } from '../flow/FlowLoader'
import { ExecutionLogger } from './ExecutionLogger'
import { FlowDefinition, FlowNodeDefinition } from '../flow/ExecutionContracts'

export class FlowEngine {
  private isRunning = false
  private pollInterval: NodeJS.Timeout | null = null

  public start() {
    if (this.isRunning) return
    this.isRunning = true
    this.pollInterval = setInterval(() => this.tick(), 5000)
    console.log('[FlowEngine] Started — polling every 5s')
  }

  public stop() {
    this.isRunning = false
    if (this.pollInterval) clearInterval(this.pollInterval)
    console.log('[FlowEngine] Stopped')
  }

  // ── Trigger Campaign ─────────────────────────────
  public triggerCampaign(campaignId: string) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any
    if (!campaign) return console.error(`[FlowEngine] Campaign ${campaignId} not found`)

    const flow = flowLoader.get(campaign.workflow_id) as FlowDefinition | undefined
    if (!flow) return console.error(`[FlowEngine] Flow ${campaign.workflow_id} not found`)

    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('active', campaignId)
    ExecutionLogger.campaignEvent(campaignId, 'campaign:triggered', 'Campaign triggered')

    // Find start nodes (no incoming edges)
    const targets = new Set(flow.edges.map(e => e.to))
    // Exclude: nodes that are edge targets, AND nodes that are children of loop nodes
    const loopChildren = new Set<string>()
    for (const node of flow.nodes) {
      if (node.children) {
        for (const childId of node.children) loopChildren.add(childId)
      }
    }
    const startNodes = flow.nodes.filter(n => !targets.has(n.instance_id) && !loopChildren.has(n.instance_id))

    console.log(`[FlowEngine] Registered nodes: ${nodeRegistry.getAll().map(n => n.manifest.id).join(', ')}`)
    console.log(`[FlowEngine] Start nodes: ${startNodes.map(n => n.instance_id).join(', ')}`)

    for (const node of startNodes) {
      this.createJob(campaignId, campaign.workflow_id, node.instance_id, node.node_id, {})
    }
  }

  public pauseCampaign(campaignId: string) {
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('paused', campaignId)
    ExecutionLogger.campaignEvent(campaignId, 'campaign:paused', 'Campaign paused')
  }

  public resumeCampaign(campaignId: string) {
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('active', campaignId)
    ExecutionLogger.campaignEvent(campaignId, 'campaign:resumed', 'Campaign resumed')
  }

  // ── Tick ─────────────────────────────────────────
  private async tick() {
    const jobs = JobQueue.getPendingJobs(5)
    for (const job of jobs) {
      await this.executeJob(job)
    }
  }

  // ── Execute Job ──────────────────────────────────
  private async executeJob(job: JobRecord) {
    try {
      JobQueue.updateStatus(job.id, 'running')

      const flow = flowLoader.get(job.workflow_id) as FlowDefinition | undefined
      if (!flow) throw new Error(`Flow ${job.workflow_id} not found`)

      const nodeDef = flow.nodes.find(n => n.instance_id === job.instance_id)
      if (!nodeDef) throw new Error(`Node ${job.instance_id} not found in flow`)

      const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(job.campaign_id) as any
      const params = JSON.parse(campaign?.params || '{}')
      const inputData = JSON.parse(job.data_json || '{}')

      // ── Is this a loop node? ──────────────────────
      if (nodeDef.children && nodeDef.children.length > 0) {
        await this.executeLoop(job, flow, nodeDef, inputData, params)
        JobQueue.updateStatus(job.id, 'completed')
        return
      }

      // ── Regular node execution ────────────────────
      const NodeImpl = nodeRegistry.get(nodeDef.node_id)
      if (!NodeImpl) throw new Error(`Node impl ${nodeDef.node_id} not registered`)

      const startTime = Date.now()
      ExecutionLogger.nodeStart(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id, {})

      const ctx = {
        campaign_id: job.campaign_id,
        job_id: job.id,
        params,
        logger: {
          info: (msg: string) => ExecutionLogger.log({
            campaign_id: job.campaign_id, job_id: job.id,
            instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
            level: 'info', event: 'node:log', message: msg
          }),
          error: (msg: string, err?: any) => ExecutionLogger.log({
            campaign_id: job.campaign_id, job_id: job.id,
            instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
            level: 'error', event: 'node:log', message: msg,
            data: { error: err?.message || String(err) }
          })
        },
        onProgress: (msg: string) => {
          ExecutionLogger.nodeProgress(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id, msg)
        }
      }

      const result = await NodeImpl.execute(inputData, ctx)
      const durationMs = Date.now() - startTime

      ExecutionLogger.nodeEnd(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id,
        { action: result.action, message: result.message }, durationMs)

      JobQueue.updateStatus(job.id, 'completed')

      // ── Handle flow control ───────────────────────
      if (result.action === 'finish') {
        db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('finished', job.campaign_id)
        ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:finished', result.message || 'Campaign finished')
        return
      }

      if (result.action === 'recall' && result.recall_target) {
        const targetNode = flow.nodes.find(n => n.instance_id === result.recall_target)
        if (targetNode) {
          this.createJob(job.campaign_id, job.workflow_id, targetNode.instance_id, targetNode.node_id, result.data || {})
          ExecutionLogger.log({
            campaign_id: job.campaign_id, instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
            level: 'info', event: 'node:recall',
            message: `Recalling ${result.recall_target}`,
          })
        }
        return
      }

      // Default: continue to next node via edges
      const nextEdges = flow.edges.filter(e => e.from === nodeDef.instance_id)
      for (const edge of nextEdges) {
        const nextNode = flow.nodes.find(n => n.instance_id === edge.to)
        if (nextNode) {
          this.createJob(job.campaign_id, job.workflow_id, nextNode.instance_id, nextNode.node_id, result.data || {})
        }
      }

    } catch (err: any) {
      const errorMsg = err.message || String(err)
      JobQueue.updateStatus(job.id, 'failed', errorMsg)
      ExecutionLogger.nodeError(job.campaign_id, job.id, job.instance_id, job.node_id, errorMsg)

      if (errorMsg.includes('CAPTCHA') || errorMsg.includes('captcha')) {
        db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('needs_captcha', job.campaign_id)
        ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:needs-captcha', 'CAPTCHA detected')
      }
    }
  }

  // ── Loop Execution ───────────────────────────────
  // Receives an array of items, runs children pipeline for each item
  private async executeLoop(
    job: JobRecord,
    flow: FlowDefinition,
    loopDef: FlowNodeDefinition,
    inputData: any,
    params: Record<string, any>
  ) {
    const items = Array.isArray(inputData) ? inputData : (inputData.videos || inputData.items || [inputData])
    const children = loopDef.children || []

    ExecutionLogger.log({
      campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
      level: 'info', event: 'loop:start',
      message: `Loop "${loopDef.instance_id}" processing ${items.length} items through ${children.length} children`
    })

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      let currentData = item

      for (const childInstanceId of children) {
        const childDef = flow.nodes.find(n => n.instance_id === childInstanceId)
        if (!childDef) continue

        const NodeImpl = nodeRegistry.get(childDef.node_id)
        if (!NodeImpl) {
          ExecutionLogger.log({
            campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
            level: 'warn', event: 'node:not-found',
            message: `Node impl ${childDef.node_id} not registered, skipping`
          })
          continue
        }

        const startTime = Date.now()
        ExecutionLogger.nodeStart(job.campaign_id, job.id, childDef.instance_id, childDef.node_id,
          { itemIndex: i, totalItems: items.length })

        const ctx = {
          campaign_id: job.campaign_id,
          job_id: job.id,
          params,
          logger: {
            info: (msg: string) => ExecutionLogger.log({
              campaign_id: job.campaign_id, job_id: job.id,
              instance_id: childDef.instance_id, node_id: childDef.node_id,
              level: 'info', event: 'node:log', message: msg
            }),
            error: (msg: string, err?: any) => ExecutionLogger.log({
              campaign_id: job.campaign_id, job_id: job.id,
              instance_id: childDef.instance_id, node_id: childDef.node_id,
              level: 'error', event: 'node:log', message: msg,
              data: { error: err?.message || String(err) }
            })
          },
          onProgress: (msg: string) => {
            ExecutionLogger.nodeProgress(job.campaign_id, job.id, childDef.instance_id, childDef.node_id, msg)
          }
        }

        try {
          const result = await NodeImpl.execute(currentData, ctx)
          const durationMs = Date.now() - startTime
          ExecutionLogger.nodeEnd(job.campaign_id, job.id, childDef.instance_id, childDef.node_id,
            { action: result.action }, durationMs)

          // Flow control from child
          if (result.action === 'finish') {
            db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('finished', job.campaign_id)
            ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:finished', result.message || 'Finished by child node')
            return
          }

          if (result.action === 'recall' && result.recall_target) {
            const targetNode = flow.nodes.find(n => n.instance_id === result.recall_target)
            if (targetNode) {
              this.createJob(job.campaign_id, job.workflow_id, targetNode.instance_id, targetNode.node_id, result.data || {})
            }
            return
          }

          currentData = result.data
        } catch (err: any) {
          ExecutionLogger.nodeError(job.campaign_id, job.id, childDef.instance_id, childDef.node_id, err.message)
          // Skip this item on error, continue to next
          break
        }
      }
    }

    // Loop done — continue to edges after loop node
    const nextEdges = flow.edges.filter(e => e.from === loopDef.instance_id)
    for (const edge of nextEdges) {
      const nextNode = flow.nodes.find(n => n.instance_id === edge.to)
      if (nextNode) {
        this.createJob(job.campaign_id, job.workflow_id, nextNode.instance_id, nextNode.node_id, { loopCompleted: true, itemCount: items.length })
      }
    }
  }

  // ── Helpers ──────────────────────────────────────
  private createJob(campaignId: string, workflowId: string, instanceId: string, nodeId: string, data: any, scheduledAt?: number) {
    const jobId = JobQueue.create({
      campaign_id: campaignId,
      workflow_id: workflowId,
      node_id: nodeId,
      instance_id: instanceId,
      type: 'FLOW_STEP',
      status: 'pending',
      data_json: JSON.stringify(data),
      scheduled_at: scheduledAt
    })

    ExecutionLogger.log({
      campaign_id: campaignId, instance_id: instanceId, node_id: nodeId,
      level: 'info', event: 'job:created',
      message: `Job created for ${instanceId}`,
      data: { jobId }
    })

    return jobId
  }
}

export const flowEngine = new FlowEngine()

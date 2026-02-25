import { nodeRegistry } from '../nodes/NodeRegistry'
import { JobQueue, JobRecord } from '../../main/db/JobQueue'
import { db } from '../../main/db/Database'
import { flowLoader } from '../flow/FlowLoader'
import { ExecutionLogger } from './ExecutionLogger'
import { FlowDefinition, FlowNodeDefinition } from '../flow/ExecutionContracts'

/**
 * Safely evaluate a conditional edge expression against data.
 * Only top-level keys of `data` are exposed as variables.
 * Returns false on any error.
 */
function safeEval(expression: string, data: any): boolean {
  try {
    const safeData = typeof data === 'object' && data !== null ? data : {}
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(safeData), `"use strict"; return Boolean(${expression})`)
    return fn(...Object.values(safeData))
  } catch {
    return false
  }
}

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

    // Re-trigger: check if there are any pending/running jobs already.
    // If none exist, the loop ended or was interrupted — re-trigger from start.
    // Deduplicator will skip already-processed videos, so this is safe to re-run.
    const existingJobs = db.prepare(
      `SELECT COUNT(*) as cnt FROM jobs WHERE campaign_id = ? AND status IN ('pending', 'running')`
    ).get(campaignId) as any

    if (!existingJobs || existingJobs.cnt === 0) {
      ExecutionLogger.campaignEvent(campaignId, 'campaign:retriggered',
        'No pending jobs found after resume — re-triggering campaign from start')
      this.triggerCampaign(campaignId)
    }
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

      const resultPromise = NodeImpl.execute(inputData, ctx)
      
      let result: any
      if (typeof nodeDef.timeout === 'number') {
        ExecutionLogger.log({
          campaign_id: job.campaign_id, job_id: job.id, instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
          level: 'info', event: 'node:timeout_set', message: `Setting timeout of ${nodeDef.timeout}ms`
        })
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Node timeout exceeded (${nodeDef.timeout}ms)`)), nodeDef.timeout)
        )
        result = await Promise.race([resultPromise, timeoutPromise])
      } else {
        result = await resultPromise
      }

      const durationMs = Date.now() - startTime

      ExecutionLogger.nodeEnd(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id,
        { action: result.action, message: result.message }, durationMs)

      // Emit structured data for live detail views
      ExecutionLogger.nodeData(job.campaign_id, nodeDef.instance_id, nodeDef.node_id, result.data)

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

      // Default: continue to next node via edges (supports conditional `when` expressions)
      const nextEdges = flow.edges.filter(e => {
        if (e.from !== nodeDef.instance_id) return false
        if (!e.when) return true // unconditional edge
        return safeEval(e.when, result.data)
      })
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
    let items = Array.isArray(inputData) ? inputData : (inputData.videos || inputData.items || [inputData])
    // Always process in scheduled_for ASC order (videos may arrive in scanner/insertion order)
    if (items.length > 1 && items[0]?.scheduled_for != null) {
      items = [...items].sort((a, b) => (a.scheduled_for ?? 0) - (b.scheduled_for ?? 0))
    } else if (items.length > 1 && items[0]?.queue_index != null) {
      items = [...items].sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0))
    }

    const children = loopDef.children || []

    // ── Resume from last processed index ──────────────
    const campaignRow = db.prepare('SELECT last_processed_index FROM campaigns WHERE id = ?').get(job.campaign_id) as any
    const startIndex = campaignRow?.last_processed_index ?? 0

    ExecutionLogger.log({
      campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
      level: 'info', event: 'loop:start',
      message: `Loop "${loopDef.instance_id}" processing ${items.length} items through ${children.length} children${startIndex > 0 ? ` (resuming from index ${startIndex})` : ''}`
    })

    for (let i = startIndex; i < items.length; i++) {
      const item = items[i]
      let currentData = item
      let skipToNextItem = false  // set when a node skips the item but rest of pipeline should still run

      // Check campaign status — stop if paused/cancelled
      const campaignStatus = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(job.campaign_id) as any)?.status
      if (campaignStatus === 'paused' || campaignStatus === 'cancelled') {
        ExecutionLogger.log({
          campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
          level: 'info', event: 'loop:paused',
          message: `Loop paused at item ${i + 1}/${items.length} (campaign ${campaignStatus})`
        })
        return
      }

      ExecutionLogger.log({
        campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
        level: 'info', event: 'loop:iteration',
        message: `Processing item ${i + 1}/${items.length}`
      })

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

        // If item was skipped by a previous node, only run:
        // - timeout (to respect gaps)
        // - condition/notify (to fire side-effect notifications)
        if (skipToNextItem) {
          const allowOnSkip = ['core.timeout', 'core.condition', 'core.notify']
          if (!allowOnSkip.includes(childDef.node_id)) continue
        }

        // Input contract validation (only for non-skip phases)
        if (!skipToNextItem && (currentData === null || currentData === undefined)) {
          const msg = `Node "${childDef.instance_id}" received null input — previous node may have failed or returned empty data`
          ExecutionLogger.log({
            campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
            level: 'error', event: 'node:input-error', message: msg
          })
          skipToNextItem = true // Mark as skipped, continue to next child (e.g. timeout)
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
          const resultPromise = NodeImpl.execute(skipToNextItem ? {} : currentData, ctx)
          
          let result: any
          if (typeof childDef.timeout === 'number') {
            ExecutionLogger.log({
              campaign_id: job.campaign_id, job_id: job.id, instance_id: childDef.instance_id, node_id: childDef.node_id,
              level: 'info', event: 'node:timeout_set', message: `Setting timeout of ${childDef.timeout}ms`
            })
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Node timeout exceeded (${childDef.timeout}ms)`)), childDef.timeout)
              )
              result = await Promise.race([resultPromise, timeoutPromise])
            } else {
            result = await resultPromise
          }

          const durationMs = Date.now() - startTime
          ExecutionLogger.nodeEnd(job.campaign_id, job.id, childDef.instance_id, childDef.node_id,
            { action: result.action }, durationMs)

          // Emit structured data for live detail views
          ExecutionLogger.nodeData(job.campaign_id, childDef.instance_id, childDef.node_id, result.data)

          // Update campaign counters based on node type
          this.updateCampaignCounters(job.campaign_id, childDef.node_id, result)

          // Flow control from child
          if (result.action === 'finish') {
            db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('finished', job.campaign_id)
            ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:finished', result.message || 'Finished by child node')
            return
          }

          if (result.action === 'continue' && !result.data) {
            // Node skipped this item (e.g. dedup, CAPTCHA).
            // Set flag so we still run timeout before next item — don't break immediately.
            if (!skipToNextItem) {
              ExecutionLogger.log({
                campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
                level: 'info', event: 'node:skip',
                message: `Item skipped by ${childDef.instance_id} — will still run timeout before next item`
              })
              skipToNextItem = true
            }
            continue
          }

          currentData = result.data
        } catch (err: any) {
          ExecutionLogger.nodeError(job.campaign_id, job.id, childDef.instance_id, childDef.node_id, err.message)

          // Per-node error handling
          const onError = childDef.on_error || 'skip'
          if (onError === 'stop_campaign') {
            db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('error', job.campaign_id)
            ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:error',
              `Campaign stopped: node "${childDef.instance_id}" failed: ${err.message}`)
            return
          }
          // 'skip' (default) — set flag and still run timeout
          skipToNextItem = true
        }
      }

      // ── Save progress: update last_processed_index ────
      try {
        db.prepare('UPDATE campaigns SET last_processed_index = ? WHERE id = ?').run(i + 1, job.campaign_id)

        // Update video status in DB based on what happened
        const videoId = item?.platform_id || item?.id
        if (videoId && !skipToNextItem) {
          db.prepare(`UPDATE videos SET status = 'processing' WHERE platform_id = ? AND campaign_id = ? AND status = 'queued'`)
            .run(videoId, job.campaign_id)
        }
      } catch { /* non-critical */ }
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

  // ── Update campaign counters ──────────────────────
  private updateCampaignCounters(campaignId: string, nodeId: string, result: any) {
    try {
      if (nodeId.includes('scanner') && result.data) {
        const count = Array.isArray(result.data) ? result.data.length : 1
        db.prepare('UPDATE campaigns SET queued_count = queued_count + ? WHERE id = ?').run(count, campaignId)
      } else if (nodeId.includes('downloader') && result.data?.local_path) {
        db.prepare('UPDATE campaigns SET downloaded_count = downloaded_count + 1 WHERE id = ?').run(campaignId)
      } else if (nodeId.includes('publisher') && result.data?.published) {
        db.prepare('UPDATE campaigns SET published_count = published_count + 1 WHERE id = ?').run(campaignId)
      }
    } catch { /* non-critical */ }
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

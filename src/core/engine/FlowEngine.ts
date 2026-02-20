import { FlowDefinition } from '../flow/ExecutionContracts'
import { nodeRegistry } from '../nodes/NodeRegistry'
import { JobQueue, JobRecord } from '../../main/db/JobQueue'
import { db } from '../../main/db/Database'
import { flowLoader } from '../flow/FlowLoader'

export class FlowEngine {
  private isRunning = false
  private pollInterval: NodeJS.Timeout | null = null

  public start() {
    if (this.isRunning) return
    this.isRunning = true
    this.pollInterval = setInterval(() => this.tick(), 5000)
    console.log('[FlowEngine] Started')
  }

  public stop() {
    this.isRunning = false
    if (this.pollInterval) clearInterval(this.pollInterval)
    console.log('[FlowEngine] Stopped')
  }

  // Called to start a campaign immediately (from UI or cron)
  public triggerCampaign(campaignId: string) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any
    if (!campaign) return

    const flow = flowLoader.get(campaign.workflow_id)
    if (!flow) return

    // Find initial scanner/trigger nodes (nodes without incoming edges)
    const targets = new Set(flow.edges.map(e => e.to_instance))
    const startNodes = flow.nodes.filter(n => !targets.has(n.instance_id))

    for (const node of startNodes) {
      if (node.execution.strategy === 'scheduled_recurring') {
        JobQueue.create({
          campaign_id: campaignId,
          workflow_id: campaign.workflow_id,
          node_id: node.node_id,
          instance_id: node.instance_id,
          type: node.execution.job_type || 'FLOW_SCAN',
          status: 'pending',
          data_json: JSON.stringify({ trigger: 'manual' })
        })
      }
    }
  }

  private async tick() {
    const jobs = JobQueue.getPendingJobs(5)
    for (const job of jobs) {
      await this.executeJob(job)
    }
  }

  private async executeJob(job: JobRecord) {
    try {
      JobQueue.updateStatus(job.id, 'running')
      
      const flow = flowLoader.get(job.workflow_id)
      if (!flow) throw new Error(`Flow ${job.workflow_id} not found`)
      
      const nodeDef = flow.nodes.find(n => n.instance_id === job.instance_id)
      if (!nodeDef) throw new Error(`Node instance ${job.instance_id} not found locally`)
      
      const NodeClass = nodeRegistry.get(nodeDef.node_id)
      if (!NodeClass) throw new Error(`Node implementation ${nodeDef.node_id} not registered`)

      const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(job.campaign_id) as any
      const campaignParams = JSON.parse(campaign.params || '{}')
      
      // Merge config: campaign params override default node config
      const config = { ...nodeDef.config, ...(campaignParams[job.instance_id] || {}) }
      
      let currentResult: any = { data: JSON.parse(job.data_json || '{}') }
      let currentNodeDef = nodeDef
      let currentNodeClass = NodeClass

      // Inline execution loop: keep traversing edges as long as downstream is 'inline'
      while (true) {
        const logger = {
          info: (msg) => console.log(`[Job ${job.id}][${currentNodeDef.instance_id}] ${msg}`),
          error: (msg, err) => console.error(`[Job ${job.id}][${currentNodeDef.instance_id}] ERROR: ${msg}`, err)
        }

        const ctx = {
          campaign_id: job.campaign_id,
          job_id: job.id,
          config,
          variables: campaignParams.variables || {},
          logger,
          onProgress: (msg) => { /* Could emit IPC here */ }
        }

        // Execute node
        const execResult = await currentNodeClass.execute(currentResult, ctx)

        // Save variables back if modified
        if (Object.keys(ctx.variables).length > 0) {
          campaignParams.variables = ctx.variables
          db.prepare('UPDATE campaigns SET params = ? WHERE id = ?').run(JSON.stringify(campaignParams), job.campaign_id)
        }

        // Process downstream edges
        const outEdges = flow.edges.filter(e => e.from_instance === currentNodeDef.instance_id)
        
        if (outEdges.length === 0) break // End of flow

        // For simplicity right now, assume single downstream edge per node in inline traversal.
        // If branching was needed, we'd need a more complex recursive pipeline.
        const targetInstance = outEdges[0].to_instance
        const targetDef = flow.nodes.find(n => n.instance_id === targetInstance)
        if (!targetDef) break

        if (targetDef.execution.strategy === 'inline') {
          // Flow directly into next node
          currentNodeDef = targetDef
          currentNodeClass = nodeRegistry.get(targetDef.node_id)!
          currentResult = execResult
          continue
        }

        if (targetDef.execution.strategy === 'per_item_job') {
          this.handleFanOut(job.campaign_id, job.workflow_id, targetDef, execResult)
          break
        }
        
        break // Stop inline execution
      }

      JobQueue.updateStatus(job.id, 'completed')

      // Reschedule recurring trigger if applicable
      if (nodeDef.execution.strategy === 'scheduled_recurring' && campaign.status === 'active') {
        const repeat = nodeDef.execution.repeat_after
        let delayMs = 60 * 60 * 1000 // default 1hr
        if (repeat?.unit === 'minutes') {
          // Simplistic schedule resolution
          const val = typeof repeat.source === 'number' ? repeat.source : (campaignParams.schedule?.interval_minutes || 60)
          delayMs = val * 60 * 1000
        }
        
        JobQueue.create({
          campaign_id: job.campaign_id,
          workflow_id: job.workflow_id,
          node_id: nodeDef.node_id,
          instance_id: nodeDef.instance_id,
          type: nodeDef.execution.job_type,
          scheduled_at: Date.now() + delayMs
        })
      }

    } catch (err: any) {
      console.error(`[Job ${job.id}] Failed:`, err)
      JobQueue.updateStatus(job.id, 'failed', err.message || String(err))
    }
  }

  private handleFanOut(campaignId: string, workflowId: string, targetDef: any, result: any) {
    let items: any[] = []
    if (result.emit_mode === 'batch' && Array.isArray(result.data)) {
      items = result.data
    } else {
      items = [result.data]
    }

    const gapMs = targetDef.execution.gap_between_items?.fixed_value || 0
    let scheduledTime = Date.now()

    for (const item of items) {
      JobQueue.create({
        campaign_id: campaignId,
        workflow_id: workflowId,
        node_id: targetDef.node_id,
        instance_id: targetDef.instance_id,
        type: targetDef.execution.job_type,
        data_json: JSON.stringify(item),
        scheduled_at: scheduledTime
      })
      scheduledTime += gapMs
    }
  }
}

export const flowEngine = new FlowEngine()

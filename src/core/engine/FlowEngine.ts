import { nodeRegistry } from '../nodes/NodeRegistry'
import { jobRepo } from '@main/db/repositories/JobRepo'
import { campaignRepo, CampaignStore } from '@main/db/repositories/CampaignRepo'
import { FlowResolver } from '../flow/FlowResolver'
import { runtimeProjectionService } from '@main/services/RuntimeProjectionService'
import { flowLoader } from '../flow/FlowLoader'
import { ExecutionLogger } from './ExecutionLogger'
import { FlowDefinition, FlowNodeDefinition } from '../flow/ExecutionContracts'
import type { JobDocument } from '@main/db/models/Job'
import { asyncTaskScheduler } from '@main/services/AsyncTaskScheduler'
import { AppSettingsService } from '@main/services/AppSettingsService'
import { isNetworkError, isDiskError } from '../nodes/NodeHelpers'
import { getFreeDiskSpaceMB } from '@main/utils/diskSpace'
import { CodedError } from '@core/errors/CodedError'
import { EntityLock, CampaignPipelineLock } from './ConcurrencyLock'
import type { NodeRetryPolicy } from '../nodes/NodeDefinition'

// ── Error handling helpers ────────────────────────────────────────────

/** Auto-pause campaign on network error. Returns true if handled. */
function handleNetworkError(errorMsg: string, campaignId: string, instanceId: string, store?: CampaignStore): boolean {
  if (!isNetworkError(errorMsg)) return false
  if (store) {
    store.status = 'paused'
    store.save()
  } else {
    campaignRepo.updateStatus(campaignId, 'paused')
  }
  ExecutionLogger.campaignEvent(campaignId, 'campaign:network-error',
    `?? Auto-paused: network error in ${instanceId} - ${errorMsg}`)
  ExecutionLogger.emitToRenderer('campaign:healthcheck-failed', {
    campaign_id: campaignId, errors: [errorMsg], message: `Network error: ${errorMsg}`,
  })
  return true
}

/** Auto-fail campaign on disk error. Returns true if handled. */
function handleDiskError(errorMsg: string, campaignId: string, instanceId: string, store?: CampaignStore): boolean {
  if (!isDiskError(errorMsg)) return false
  if (store) {
    store.status = 'error'
    store.save()
  } else {
    campaignRepo.updateStatus(campaignId, 'error')
  }
  ExecutionLogger.campaignEvent(campaignId, 'campaign:disk-error',
    `? Failed: storage error in ${instanceId} - ${errorMsg}`)
  ExecutionLogger.emitToRenderer('campaign:healthcheck-failed', {
    campaign_id: campaignId, errors: [errorMsg], message: `Disk error: ${errorMsg}`,
  })
  return true
}

/**
 * Compute retry delay based on policy and current attempt.
 * Returns 0 if retry is not applicable.
 */
function computeRetryDelay(policy: NodeRetryPolicy | undefined, attempt: number): number {
  if (!policy || policy.maxRetries <= 0 || attempt >= policy.maxRetries) return 0
  const base = policy.initialDelayMs || 1000
  const max = policy.maxDelayMs || 60000
  switch (policy.backoff) {
    case 'fixed':       return Math.min(base, max)
    case 'linear':      return Math.min(base * (attempt + 1), max)
    case 'exponential': return Math.min(base * Math.pow(2, attempt), max)
    default:            return Math.min(base, max)
  }
}

// ── DRY Helpers ──────────────────────────────────────────────────────────

/** Safely evaluate a conditional edge expression against data. */
function safeEval(expression: string, data: any): boolean {
  try {
    const safeData = typeof data === 'object' && data !== null ? data : {}
    const fn = new Function(...Object.keys(safeData), `"use strict"; return Boolean(${expression})`)
    return fn(...Object.values(safeData))
  } catch {
    return false
  }
}

/** Find a node definition in a flow by instance_id. */
function findNode(flow: FlowDefinition, instanceId: string): FlowNodeDefinition | undefined {
  return flow.nodes.find(n => n.instance_id === instanceId)
}

/** Resolve outgoing edges from a node, filtering by optional `when` conditions. */
function resolveNextEdges(flow: FlowDefinition, fromInstanceId: string, data: any): FlowNodeDefinition[] {
  return flow.edges
    .filter(e => e.from === fromInstanceId && (!e.when || safeEval(e.when, data)))
    .map(e => findNode(flow, e.to))
    .filter(Boolean) as FlowNodeDefinition[]
}

/** Check if campaign is still runnable (not paused/cancelled). */
function isCampaignActive(campaignId: string): boolean {
  const store = campaignRepo.tryOpen(campaignId)
  if (!store) return false
  return store.status !== 'paused' && store.status !== 'cancelled'
}

/**
 * Match a node error against YAML-declared events.
 * Event keys use colon format: 'captcha:detected', 'violation:detected', etc.
 * Match by checking if the error message contains all parts of the event key.
 * E.g. error "CAPTCHA detected" matches key "captcha:detected".
 */
function matchNodeEvent(nodeDef: FlowNodeDefinition, errorMsg: string): { eventKey: string; handler: { action: string; emit?: string } } | null {
  if (!nodeDef.events || !errorMsg) return null
  const lower = errorMsg.toLowerCase()
  for (const [key, handler] of Object.entries(nodeDef.events)) {
    // Split key "captcha:detected" -> ["captcha", "detected"] and check each part
    const parts = key.toLowerCase().split(':')
    if (parts.every(p => lower.includes(p))) {
      return { eventKey: key, handler }
    }
  }
  return null
}

/** Find start nodes (no incoming edges, not managed sub-nodes of loop/parallel). */
function findStartNodes(flow: FlowDefinition): FlowNodeDefinition[] {
  const targets = new Set(flow.edges.map(e => e.to))
  const managed = new Set<string>()
  for (const node of flow.nodes) {
    if (node.children) {
      for (const childId of node.children) managed.add(childId)
    }
  }
  return flow.nodes.filter(n => !targets.has(n.instance_id) && !managed.has(n.instance_id))
}

/** Build a node execution context.
 * `campaignParams` = wizard config (sources, intervalMinutes, etc.)
 * `nodeParams`     = inline params from flow.yaml for this specific node (title, body, expression, etc.)
 * Node params take precedence over campaign params.
 */
function buildNodeContext(
  job: JobDocument,
  nodeDef: FlowNodeDefinition,
  campaignParams: Record<string, any>,
  store: CampaignStore
) {
  // Merge: node-level params override campaign params so that
  // core.notify gets its title/body/sound from flow.yaml
  const params = { ...campaignParams, ...(nodeDef.params || {}) }
  return {
    campaign_id: job.campaign_id,
    job_id: job.id,
    params,
    store,
    logger: {
      info: (msg: string) => ExecutionLogger.log({
        campaign_id: job.campaign_id, job_id: job.id,
        instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
        level: 'info', event: 'node:log', message: msg,
      }),
      error: (msg: string, err?: any) => ExecutionLogger.log({
        campaign_id: job.campaign_id, job_id: job.id,
        instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
        level: 'error', event: 'node:log', message: msg,
        data: { error: err?.message || String(err) },
      }),
    },
    onProgress: (msg: string) => {
      ExecutionLogger.nodeProgress(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id, msg)
    },
    alert: (level: string, title: string, body?: string) => {
      store.addAlert({ instance_id: nodeDef.instance_id, node_id: nodeDef.node_id, level: level as any, title, body })
      store.save()
      ExecutionLogger.emitToRenderer('campaign:alert', {
        campaign_id: job.campaign_id, instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
        level, title, body, created_at: Date.now(),
      })
    },
    asyncTasks: {
      schedule: (taskType, payload, options) => asyncTaskScheduler.schedule(taskType, payload, options),
    },
  }
}

/** Execute a node with optional timeout. */
async function executeWithTimeout(NodeImpl: any, inputData: any, ctx: any, nodeDef: FlowNodeDefinition, job: JobDocument) {
  const resultPromise = NodeImpl.execute(inputData, ctx)
  if (typeof nodeDef.timeout === 'number') {
    ExecutionLogger.log({
      campaign_id: job.campaign_id, job_id: job.id, instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
      level: 'info', event: 'node:timeout_set', message: `Setting timeout of ${nodeDef.timeout}ms`,
    })
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Node timeout exceeded (${nodeDef.timeout}ms)`)), nodeDef.timeout)
    )
    return Promise.race([resultPromise, timeoutPromise])
  }
  return resultPromise
}

// ── FlowEngine ────────────────────────────────────────────────────────────

/**
 * Core FlowEngine - a dumb executor.
 *
 * Responsibilities:
 *   - Poll pending jobs
 *   - Resolve flow definition
 *   - Execute node implementations
 *   - Follow edges based on result
 *   - Handle loop nodes (iterate children over input array)
 *
 * Does NOT know about:
 *   - Entity records, sorting, scheduling
 *   - Download/publish counting
 *   - CAPTCHA or any workflow-specific error handling
 *   - Any domain concept - nodes handle their own logic via ctx.store
 */
export class FlowEngine {
  private isRunning = false
  private pollInterval: NodeJS.Timeout | null = null

  public start() {
    if (this.isRunning) return
    this.isRunning = true
    this.pollInterval = setInterval(() => this.tick(), 5000)
    console.log('[FlowEngine] Started - polling every 5s')
  }

  public stop() {
    this.isRunning = false
    if (this.pollInterval) clearInterval(this.pollInterval)
    console.log('[FlowEngine] Stopped')
  }

  // ── Pre-run health check ──────────────────────────────────────────
  /**
   * Quick health check before starting a campaign.
   * Checks storage space and workflow service endpoints.
   * Returns { ok, errors[] } - caller decides whether to block.
   */
  public async preRunHealthCheck(campaignId: string): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = []
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return { ok: false, errors: ['Campaign not found'] }

    // 1. Storage check (cross-platform)
    try {
      const mediaPath = AppSettingsService.getMediaStoragePath()
      const freeMB = await getFreeDiskSpaceMB(mediaPath)
      if (freeMB >= 0 && freeMB < 100) {
        errors.push(`Insufficient disk space: only ${freeMB} MB free (minimum 100 MB required)`)
      }
    } catch (err: any) {
      // Non-blocking - log but don't prevent start
      console.warn(`[FlowEngine] Storage check failed: ${err?.message}`)
    }

    // 2. Workflow service check
    try {
      const flow = FlowResolver.resolve(campaignId) || flowLoader.get(store.doc.workflow_id)
      if (flow?.health_checks?.length) {
        const { net } = require('electron')
        for (const hc of flow.health_checks) {
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            await net.fetch(hc.url, { method: 'HEAD', signal: controller.signal })
            clearTimeout(timeout)
          } catch {
            errors.push(`${hc.name} unreachable (${hc.url})`)
          }
        }
      }
    } catch (err: any) {
      console.warn(`[FlowEngine] Service check failed: ${err?.message}`)
    }

    return { ok: errors.length === 0, errors }
  }

  // ── Trigger Campaign ──────────────────────────────────────────────────
  public async triggerCampaign(campaignId: string) {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return console.error(`[FlowEngine] Campaign ${campaignId} not found`)

    const flow = FlowResolver.resolve(campaignId) || flowLoader.get(store.doc.workflow_id)
    if (!flow) return console.error(`[FlowEngine] Flow ${store.doc.workflow_id} not found`)

    // Pre-run health check
    const health = await this.preRunHealthCheck(campaignId)
    if (!health.ok) {
      const errorMsg = health.errors.join('; ')
      store.status = 'error'
      store.save()
      ExecutionLogger.campaignEvent(campaignId, 'campaign:healthcheck-failed',
        `? Cannot start: ${errorMsg}`)
      // Emit to renderer for toast
      ExecutionLogger.emitToRenderer('campaign:healthcheck-failed', {
        campaign_id: campaignId, errors: health.errors, message: errorMsg,
      })
      console.error(`[FlowEngine] Health check failed for ${campaignId}: ${errorMsg}`)
      return
    }

    store.status = 'active'
    store.save()
    ExecutionLogger.campaignEvent(campaignId, 'campaign:triggered', 'Campaign triggered')

    const startNodes = findStartNodes(flow)
    console.log(`[FlowEngine] Start nodes: ${startNodes.map(n => n.instance_id).join(', ')}`)

    for (const node of startNodes) {
      this.createJob(campaignId, store.doc.workflow_id, node.instance_id, node.node_id, {})
    }
  }

  public pauseCampaign(campaignId: string) {
    campaignRepo.updateStatus(campaignId, 'paused')
    // Note: we do NOT force-release CampaignPipelineLock or EntityLock here.
    // The running job will detect isCampaignActive() === false on the next loop iteration
    // and exit naturally, releasing its own locks via try/finally.
    // Force-releasing here would create a race window where a new job starts before the old one exits.
    ExecutionLogger.campaignEvent(campaignId, 'campaign:paused', 'Campaign paused')
  }

  /** Save pause checkpoint via RuntimeProjectionService. */
  private savePauseCheckpoint(
    campaignId: string,
    checkpoint: {
      itemIndex: number
      entityKey?: string
      lastActiveChild?: string
      lastProgressMessage?: string
      reason: 'manual' | 'event' | 'network' | 'disk'
      eventKey?: string
    }
  ) {
    runtimeProjectionService.setPauseCheckpoint(campaignId, {
      ...checkpoint,
      timestamp: Date.now(),
    })
  }

  public async resumeCampaign(campaignId: string) {
    // ── Pre-run health check before resume
    const health = await this.preRunHealthCheck(campaignId)
    if (!health.ok) {
      const errorMsg = health.errors.join('; ')
      ExecutionLogger.campaignEvent(campaignId, 'campaign:healthcheck-failed',
        `? Cannot resume: ${errorMsg}`)
      ExecutionLogger.emitToRenderer('campaign:healthcheck-failed', {
        campaign_id: campaignId, errors: health.errors, message: errorMsg,
      })
      console.error(`[FlowEngine] Health check failed for resume ${campaignId}: ${errorMsg}`)
      return
    }

    campaignRepo.updateStatus(campaignId, 'active')
    ExecutionLogger.campaignEvent(campaignId, 'campaign:resumed', 'Campaign resumed')
    // RuntimeProjectionService clears pauseCheckpoint via execution:trace listener

    const pendingCount = jobRepo.countPendingForCampaign(campaignId)
    if (pendingCount > 0) return // Jobs already queued, engine will pick them up

    // Check if we were mid-loop (paused inside executeLoop)
    const store = campaignRepo.tryOpen(campaignId)
    if (store) {
      const doc = store.doc as any
      const loopData = doc._loopData
      const loopInstanceId = doc._loopInstanceId
      const loopNodeId = doc._loopNodeId || 'core.loop'
      if (loopData && loopInstanceId) {
        ExecutionLogger.campaignEvent(campaignId, 'campaign:loop-resumed',
          `Resuming loop from item ${store.lastProcessedIndex + 1}`)
        this.createJob(campaignId, store.doc.workflow_id, loopInstanceId, loopNodeId, loopData)
        return
      }
    }

    // Truly no pending work - re-trigger from start
    ExecutionLogger.campaignEvent(campaignId, 'campaign:retriggered',
      'No pending jobs - re-triggering')
    await this.triggerCampaign(campaignId)
  }

  // ── Tick ──────────────────────────────────────────────────────────────
  private async tick() {
    const jobs = jobRepo.findPending(5)
    for (const job of jobs) {
      try {
        await this.executeJob(job)
      } catch (err: any) {
        // Catch any unhandled error that escapes executeJob's own try-catch
        console.error(`[FlowEngine] Unhandled error in tick for job ${job.id}:`, err?.message || err)
        try {
          jobRepo.updateStatus(job.id, 'failed', `Unhandled tick error: ${err?.message || err}`)
        } catch (_) { /* DB error — nothing we can do */ }
      }
    }
  }

  // ── Execute Job ───────────────────────────────────────────────────────
  private async executeJob(job: JobDocument) {
    // ── Per-campaign pipeline lock (group-aware for parallel branches) ──
    const parallelGroup = job.data?._parallelGroup as string | undefined
    if (!CampaignPipelineLock.acquire(job.campaign_id, job.id, parallelGroup)) {
      console.log(`[FlowEngine] Campaign ${job.campaign_id} already has an active job — deferring job ${job.id}`)
      // Return job to pending so it gets re-picked in the next tick
      jobRepo.updateStatus(job.id, 'pending')
      return
    }

    try {
      jobRepo.updateStatus(job.id, 'running')

      const flow = FlowResolver.resolve(job.campaign_id)
      /** @throws DG-040 — Flow definition not found for campaign */
      if (!flow) throw new CodedError('DG-040', `Flow for campaign ${job.campaign_id} not found`)

      const nodeDef = findNode(flow, job.instance_id)
      /** @throws DG-041 — Node instance not found in flow definition */
      if (!nodeDef) throw new CodedError('DG-041', `Node ${job.instance_id} not found in flow`)

      const store = campaignRepo.open(job.campaign_id)
      const params = store.params

      // ── Parallel fork node? Uses children as branch list ──────────────
      if (nodeDef.children && nodeDef.children.length > 0 && nodeDef.node_id === 'core.parallel') {
        await this.executeParallel(job, flow, nodeDef, job.data)
        jobRepo.updateStatus(job.id, 'completed')
        return
      }

      // ── Loop node? (any node with children that isn't parallel) ─────
      if (nodeDef.children && nodeDef.children.length > 0) {
        await this.executeLoop(job, flow, nodeDef, job.data, params, store)
        jobRepo.updateStatus(job.id, 'completed')
        return
      }

      // ── Regular node execution ─────────────────────────
      const NodeImpl = nodeRegistry.get(nodeDef.node_id)
      /** @throws DG-042 — Node implementation not registered */
      if (!NodeImpl) throw new CodedError('DG-042', `Node impl ${nodeDef.node_id} not registered`)

      const startTime = Date.now()
      ExecutionLogger.nodeStart(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id, {})

      const ctx = buildNodeContext(job, nodeDef, params, store)
      const result = await executeWithTimeout(NodeImpl, job.data, ctx, nodeDef, job)
      const durationMs = Date.now() - startTime

      ExecutionLogger.nodeEnd(job.campaign_id, job.id, nodeDef.instance_id, nodeDef.node_id,
        { action: result.action, message: result.message }, durationMs)
      ExecutionLogger.nodeData(job.campaign_id, nodeDef.instance_id, nodeDef.node_id, result.data)

      jobRepo.updateStatus(job.id, 'completed')

      // ── Flow control ────────────────────────────────────────────
      if (result.action === 'finish') {
        store.status = 'finished'
        store.save()
        ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:finished', result.message || 'Campaign finished')
        return
      }

      if (result.action === 'wait') {
        // Join barrier not met — reschedule with 5s delay
        jobRepo.updateStatus(job.id, 'pending') // revert from completed
        this.createJob(job.campaign_id, job.workflow_id, nodeDef.instance_id, nodeDef.node_id,
          result.data || job.data, Date.now() + 5000)
        ExecutionLogger.log({
          campaign_id: job.campaign_id, instance_id: nodeDef.instance_id, node_id: nodeDef.node_id,
          level: 'info', event: 'node:wait', message: result.message || 'Waiting for parallel branches',
        })
        return
      }

      if (result.action === 'recall' && result.recall_target) {
        const targetNode = findNode(flow, result.recall_target)
        if (targetNode) {
          this.createJob(job.campaign_id, job.workflow_id, targetNode.instance_id, targetNode.node_id, result.data || {})
        }
        return
      }

      // Default: continue to next nodes via edges
      const nextNodes = resolveNextEdges(flow, nodeDef.instance_id, result.data)
      for (const next of nextNodes) {
        this.createJob(job.campaign_id, job.workflow_id, next.instance_id, next.node_id, result.data || {})
      }

    } catch (err: any) {
      const errorMsg = err.message || String(err)
      const errorCode = err instanceof CodedError ? err.errorCode : undefined

      // ── Retry logic: check manifest retryPolicy ──────────────
      const NodeImpl = nodeRegistry.get(job.node_id)
      const retryPolicy = NodeImpl?.manifest?.retryPolicy
      const retryCount = (job.data?._retryCount as number) || 0
      const delayMs = computeRetryDelay(retryPolicy, retryCount)

      if (delayMs > 0) {
        // Retry is possible
        jobRepo.updateStatus(job.id, 'failed', errorMsg)
        ExecutionLogger.nodeError(job.campaign_id, job.id, job.instance_id, job.node_id, errorMsg)
        ExecutionLogger.emitNodeEvent(job.campaign_id, job.instance_id, 'node:retry-scheduled', {
          errorCode,
          attempt: retryCount + 1,
          maxRetries: retryPolicy!.maxRetries,
          delayMs,
          error: errorMsg,
        })
        console.log(`[FlowEngine] Retry ${retryCount + 1}/${retryPolicy!.maxRetries} for ${job.instance_id} in ${delayMs}ms`)
        this.createJob(
          job.campaign_id, job.workflow_id, job.instance_id, job.node_id,
          { ...job.data, _retryCount: retryCount + 1 },
          Date.now() + delayMs
        )
        return
      }

      // No retry — final failure
      jobRepo.updateStatus(job.id, 'failed', errorMsg)
      ExecutionLogger.nodeError(job.campaign_id, job.id, job.instance_id, job.node_id, errorMsg)
      ExecutionLogger.emitNodeEvent(job.campaign_id, job.instance_id, 'node:failed', {
        errorCode, error: errorMsg, retryable: false,
      })

      handleNetworkError(errorMsg, job.campaign_id, job.instance_id)
      handleDiskError(errorMsg, job.campaign_id, job.instance_id)
    } finally {
      // Always release the per-campaign pipeline lock when job finishes
      CampaignPipelineLock.release(job.campaign_id, job.id)
    }
  }

  // ── Parallel Execution (Fork/Join) ──────────────────────────────────
  /**
   * Fork: create one job per branch, all tagged with a shared _parallelGroup UUID.
   * Then create a join job that will poll for branch completion.
   *
   * The join node is resolved from the outgoing edges of this fork node.
   * Branch nodes are listed in `parallelDef.children`.
   */
  private async executeParallel(
    job: JobDocument,
    flow: FlowDefinition,
    parallelDef: FlowNodeDefinition,
    inputData: any,
  ) {
    const branches = parallelDef.children || []
    const groupId = `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const onBranchFail = parallelDef.params?.onBranchFail || 'continue'

    ExecutionLogger.log({
      campaign_id: job.campaign_id, instance_id: parallelDef.instance_id, node_id: parallelDef.node_id,
      level: 'info', event: 'parallel:fork',
      message: `Forking ${branches.length} branches: [${branches.join(', ')}] (group: ${groupId})`,
      data: { branches, groupId, onBranchFail },
    })

    // Create one job per branch — all share the _parallelGroup tag
    const branchData = {
      ...(inputData || {}),
      _parallelGroup: groupId,
    }

    for (const branchId of branches) {
      const branchNode = findNode(flow, branchId)
      if (!branchNode) {
        ExecutionLogger.log({
          campaign_id: job.campaign_id, instance_id: parallelDef.instance_id, node_id: parallelDef.node_id,
          level: 'error', event: 'parallel:branch-missing',
          message: `Branch node '${branchId}' not found in flow definition — skipping`,
        })
        continue
      }
      this.createJob(job.campaign_id, job.workflow_id, branchNode.instance_id, branchNode.node_id, branchData)
    }

    // Resolve join node from outgoing edges (the node after the fork)
    const joinNodes = resolveNextEdges(flow, parallelDef.instance_id, inputData)
    for (const joinNode of joinNodes) {
      // Create join job with a short delay to give branches time to start
      const joinData = {
        ...(inputData || {}),
        _parallelGroup: groupId,
      }
      // Merge fork params into join params if join node needs branches list
      this.createJob(job.campaign_id, job.workflow_id, joinNode.instance_id, joinNode.node_id,
        joinData, Date.now() + 3000)
    }
  }

  // ── Loop Execution ──────────────────────────────────────────────────
  /**
   * Core loop: iterate input array through child nodes sequentially.
   *
   * The input MUST be an array. If the loop node receives non-array data,
   * it wraps it in a single-element array.
   *
   * No sorting, no counting, no domain-specific logic.
   * Nodes handle their own domain concerns via ctx.store.
   */
  private async executeLoop(
    job: JobDocument,
    flow: FlowDefinition,
    loopDef: FlowNodeDefinition,
    inputData: any,
    params: Record<string, any>,
    store: CampaignStore
  ) {
    const items = Array.isArray(inputData) ? inputData : [inputData]
    const children = loopDef.children || []
    const startIndex = store.lastProcessedIndex

    // ── Pause checkpoint tracking ──
    let lastActiveChild = ''
    let lastProgressMsg = ''

    ExecutionLogger.log({
      campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
      level: 'info', event: 'loop:start',
      message: `Loop "${loopDef.instance_id}": ${items.length} items x ${children.length} children${startIndex > 0 ? ` (resume@${startIndex})` : ''}`,
    })

    for (let i = startIndex; i < items.length; i++) {
      // Check campaign still active
      if (!isCampaignActive(job.campaign_id)) {
        // Save loop state so resume can re-create this job
        try {
          const doc = store.doc as any
          doc._loopData = items
          doc._loopInstanceId = loopDef.instance_id
          doc._loopNodeId = loopDef.node_id
          store.save()
          // Save pause checkpoint via RuntimeProjectionService
          const entityKey = items[i]?.entityKey != null ? String(items[i].entityKey)
                          : items[i]?.platform_id != null ? String(items[i].platform_id)
                          : undefined
          this.savePauseCheckpoint(job.campaign_id, {
            itemIndex: i,
            entityKey,
            lastActiveChild: lastActiveChild || undefined,
            lastProgressMessage: lastProgressMsg || undefined,
            reason: 'manual',
          })
        } catch { /* best-effort */ }
        // Release all entity locks for this campaign on pause
        EntityLock.releaseAllForCampaign(job.campaign_id)
        ExecutionLogger.log({
          campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
          level: 'info', event: 'loop:paused',
          message: `Loop paused at item ${i + 1}/${items.length} — state saved for resume`,
        })
        return
      }

      let currentData = items[i]
      let skipToNextItem = false

      // ── Per-entity singleton guard: acquire lock for the entire child chain ──
      // Normalize entityKey to String to avoid number/string Map key mismatch
      const entityKey = currentData?.entityKey != null ? String(currentData.entityKey)
                    : currentData?.platform_id != null ? String(currentData.platform_id)
                    : undefined
      let lockAcquired = false
      if (entityKey) {
        lockAcquired = EntityLock.acquire(entityKey, loopDef.instance_id, job.id, job.campaign_id)
        if (!lockAcquired) {
          const holder = EntityLock.isLocked(entityKey)
          ExecutionLogger.log({
            campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
            level: 'warn', event: 'entity:lock-rejected',
            message: `Entity ${entityKey} is locked by ${holder?.instanceId}/${holder?.jobId} — will retry on next run`,
          })
          // Do NOT advance lastProcessedIndex — this entity should be retried on the next loop run
          continue
        }
      }

      ExecutionLogger.log({
        campaign_id: job.campaign_id, instance_id: loopDef.instance_id, node_id: loopDef.node_id,
        level: 'info', event: 'loop:iteration',
        message: `Item ${i + 1}/${items.length}`,
      })
      ExecutionLogger.nodeProgress(job.campaign_id, job.id, loopDef.instance_id, loopDef.node_id, `Loop ${i + 1}/${items.length}`)

      // Wrap all child execution in try/finally to guarantee lock release
      try {

      for (const childInstanceId of children) {
        const childDef = findNode(flow, childInstanceId)
        if (!childDef) continue

        const NodeImpl = nodeRegistry.get(childDef.node_id)
        if (!NodeImpl) {
          ExecutionLogger.log({
            campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
            level: 'warn', event: 'node:not-found',
            message: `Node impl ${childDef.node_id} not registered, skipping`,
          })
          continue
        }

        // If skipped, only run utility nodes
        if (skipToNextItem) {
          const allowOnSkip = ['core.timeout', 'core.condition']
          if (!allowOnSkip.includes(childDef.node_id)) continue
        }

        // Null input guard
        if (!skipToNextItem && currentData == null) {
          ExecutionLogger.log({
            campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
            level: 'error', event: 'node:input-error',
            message: `Node "${childDef.instance_id}" received null input`,
          })
          skipToNextItem = true
          continue
        }

        const startTime = Date.now()
        lastActiveChild = childDef.instance_id
        ExecutionLogger.nodeStart(job.campaign_id, job.id, childDef.instance_id, childDef.node_id,
          { itemIndex: i, totalItems: items.length })

        const ctx = buildNodeContext(job, childDef, params, store)
        // Intercept onProgress to capture for pause checkpoint
        const origOnProgress = ctx.onProgress
        ctx.onProgress = (msg: string) => { lastProgressMsg = msg; origOnProgress(msg) }

        try {
          const result = await executeWithTimeout(NodeImpl, skipToNextItem ? {} : currentData, ctx, childDef, job)
          const durationMs = Date.now() - startTime

          ExecutionLogger.nodeEnd(job.campaign_id, job.id, childDef.instance_id, childDef.node_id,
            { action: result.action }, durationMs)
          ExecutionLogger.nodeData(job.campaign_id, childDef.instance_id, childDef.node_id, result.data)

          // ── Flow control from child
          if (result.action === 'finish') {
            store.status = 'finished'
            store.save()
            EntityLock.releaseAllForCampaign(job.campaign_id)
            ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:finished', result.message || 'Finished by child node')
            return
          }

          if (result.action === 'continue' && !result.data) {
            if (!skipToNextItem) {
              ExecutionLogger.log({
                campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
                level: 'info', event: 'node:skip',
                message: `Item skipped by ${childDef.instance_id}`,
              })
              skipToNextItem = true
            }
            continue
          }

          currentData = result.data
        } catch (err: any) {
          ExecutionLogger.nodeError(job.campaign_id, job.id, childDef.instance_id, childDef.node_id, err.message)

          // ── YAML events handling: match error -> event key -> action + emit ───
          const matchedEvent = matchNodeEvent(childDef, err.message)
          if (matchedEvent) {
            const { eventKey, handler } = matchedEvent
            ExecutionLogger.log({
              campaign_id: job.campaign_id, instance_id: childDef.instance_id, node_id: childDef.node_id,
              level: 'warn', event: eventKey,
              message: `Event "${eventKey}" matched -> action: ${handler.action}`,
            })
            if (handler.emit) {
              ExecutionLogger.emitNodeEvent(job.campaign_id, childDef.instance_id, handler.emit, {
                error: err.message, eventKey, action: handler.action,
              })
            }
            if (handler.action === 'pause_campaign') {
              this.savePauseCheckpoint(job.campaign_id, {
                itemIndex: i, entityKey, lastActiveChild: childDef.instance_id,
                lastProgressMessage: lastProgressMsg || undefined,
                reason: 'event', eventKey,
              })
              store.status = 'paused'
              store.save()
              EntityLock.releaseAllForCampaign(job.campaign_id)
              ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:paused', `Paused by event "${eventKey}"`)
              return
            }
            if (handler.action === 'stop_campaign') {
              store.status = 'error'
              store.save()
              EntityLock.releaseAllForCampaign(job.campaign_id)
              ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:error', `Stopped by event "${eventKey}": ${err.message}`)
              return
            }
            // skip_item (default): fall through to skipToNextItem
          }

          const onError = childDef.on_error || 'skip'
          if (onError === 'stop_campaign') {
            store.status = 'error'
            store.save()
            EntityLock.releaseAllForCampaign(job.campaign_id)
            ExecutionLogger.campaignEvent(job.campaign_id, 'campaign:error',
              `Campaign stopped: node "${childDef.instance_id}" failed: ${err.message}`)
            return
          }
          skipToNextItem = true

          // Auto-pause on network or auto-fail on disk errors
          // Note: these functions change campaign status — releaseAllForCampaign is called in finally
          if (handleNetworkError(err.message, job.campaign_id, childDef.instance_id, store)) {
            this.savePauseCheckpoint(job.campaign_id, {
              itemIndex: i, entityKey, lastActiveChild: childDef.instance_id,
              lastProgressMessage: lastProgressMsg || undefined,
              reason: 'network',
            })
            EntityLock.releaseAllForCampaign(job.campaign_id)
            return
          }
          if (handleDiskError(err.message, job.campaign_id, childDef.instance_id, store)) {
            this.savePauseCheckpoint(job.campaign_id, {
              itemIndex: i, entityKey, lastActiveChild: childDef.instance_id,
              lastProgressMessage: lastProgressMsg || undefined,
              reason: 'disk',
            })
            EntityLock.releaseAllForCampaign(job.campaign_id)
            return
          }
        }
      }

      } finally {
        // ALWAYS release entity lock — even on early return from errors
        if (entityKey && lockAcquired) {
          EntityLock.release(entityKey, job.id)
        }
      }

      // Save progress after each iteration
      store.lastProcessedIndex = i + 1
      store.save()
    }

    // Loop done - continue to edges after loop node
    const nextNodes = resolveNextEdges(flow, loopDef.instance_id, { loopCompleted: true, itemCount: items.length })
    for (const next of nextNodes) {
      this.createJob(job.campaign_id, job.workflow_id, next.instance_id, next.node_id,
        { loopCompleted: true, itemCount: items.length })
    }
  }

  // ── Create Job ───────────────────────────────────────────────────────
  private createJob(campaignId: string, workflowId: string, instanceId: string, nodeId: string, data: any, scheduledAt?: number) {
    const jobId = jobRepo.createJob({
      campaign_id: campaignId,
      workflow_id: workflowId,
      node_id: nodeId,
      instance_id: instanceId,
      type: 'FLOW_STEP',
      data,
      scheduled_at: scheduledAt || Date.now(),
    })

    ExecutionLogger.log({
      campaign_id: campaignId, instance_id: instanceId, node_id: nodeId,
      level: 'info', event: 'job:created',
      message: `Job created for ${instanceId}`,
      data: { jobId },
    })

    return jobId
  }
}

export const flowEngine = new FlowEngine()

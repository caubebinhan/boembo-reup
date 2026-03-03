import { asyncTaskRegistry } from '@core/async-tasks'
import type {
  AsyncTaskDocument,
  AsyncTaskDecision,
  AsyncTaskScheduleOptions,
  AsyncTaskScheduleResult,
  LeaseHeartbeat,
} from '@core/async-tasks/types'
import { asyncTaskRepo } from '../db/repositories/AsyncTaskRepo'
import * as crypto from 'node:crypto'
import { CodedError } from '@core/errors/CodedError'

const DEFAULT_TICK_INTERVAL = 30_000  // 30s
const DEFAULT_LEASE_MS = 300_000       // 5 min
const DEFAULT_MAX_ATTEMPTS = 6
const DEFAULT_RETRY_INTERVAL_MS = 120_000  // 2 min
const DEFAULT_CLAIM_BATCH = 5
const PRUNE_INTERVAL = 3600_000  // 1 hour
const PRUNE_MAX_AGE = 7 * 24 * 3600_000  // 7 days

/**
 * Background scheduler for async tasks.
 * Polls DB every 30s, claims due tasks, executes handlers, applies decisions.
 */
export class AsyncTaskScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null
  private workerId: string
  private ticking = false

  constructor() {
    this.workerId = `worker_${process.pid}_${crypto.randomUUID().slice(0, 8)}`
  }

  start(): void {
    if (this.timer) return

    // Crash recovery: reclaim expired leases from previous runs
    const reclaimed = asyncTaskRepo.reclaimExpiredLeases()
    if (reclaimed > 0) {
      console.log(`[AsyncTaskScheduler] Reclaimed ${reclaimed} expired leases on startup`)
    }

    this.timer = setInterval(() => this.tick(), DEFAULT_TICK_INTERVAL)
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL)
    console.log(`[AsyncTaskScheduler] Started (worker=${this.workerId}, tick=${DEFAULT_TICK_INTERVAL}ms)`)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = null }
    console.log('[AsyncTaskScheduler] Stopped')
  }

  //  Schedule (called by nodes via ctx.asyncTasks) 

  schedule(
    taskType: string,
    payload: Record<string, any>,
    options: AsyncTaskScheduleOptions
  ): AsyncTaskScheduleResult {
    const now = Date.now()
    const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS
    const doc: AsyncTaskDocument = {
      id: crypto.randomUUID(),
      taskType,
      dedupeKey: options.dedupeKey,
      status: 'pending',
      payload,
      payloadVersion: options.payloadVersion ?? 1,
      state: {},
      attempt: 0,
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextRunAt: options.firstRunAt ?? (now + retryIntervalMs),
      concurrencyKey: options.concurrencyKey,
      maxConcurrent: options.maxConcurrent ?? 1,
      campaignId: options.campaignId,
      ownerKey: options.ownerKey,
      createdAt: now,
      updatedAt: now,
    }

    return asyncTaskRepo.insertIfNotExists(doc)
  }

  //  Tick 

  private async tick(): Promise<void> {
    if (this.ticking) return  // skip if previous tick still running
    this.ticking = true

    try {
      // 1. Reclaim expired leases
      const reclaimed = asyncTaskRepo.reclaimExpiredLeases()
      if (reclaimed > 0) {
        console.log(`[AsyncTaskScheduler] Reclaimed ${reclaimed} expired leases`)
      }

      // 2. Claim due tasks (concurrency already enforced inside claimDue)
      const claimed = asyncTaskRepo.claimDue(DEFAULT_CLAIM_BATCH, this.workerId, DEFAULT_LEASE_MS)
      if (claimed.length === 0) return

      console.log(`[AsyncTaskScheduler] Claimed ${claimed.length} tasks`)

      // 3. Execute each task
      for (const task of claimed) {
        await this.executeTask(task)
      }
    } catch (err) {
      console.error('[AsyncTaskScheduler] Tick error:', err)
    } finally {
      this.ticking = false
    }
  }

  private async executeTask(task: AsyncTaskDocument): Promise<void> {
    const handler = asyncTaskRegistry.getHandler(task.taskType)
    if (!handler) {
      asyncTaskRepo.applyDecision(task.id, 'failed', {
        lastError: `No handler registered for taskType '${task.taskType}'`,
      })
      return
    }

    // Validate payload
    if (handler.validate) {
      const validationError = handler.validate(task.payload, task.payloadVersion)
      if (validationError) {
        asyncTaskRepo.applyDecision(task.id, 'failed', {
          lastError: `Payload validation failed: ${validationError}`,
        })
        return
      }
    }

    // Transition claimed  -> running
    asyncTaskRepo.markRunning(task.id)
    task.status = 'running'

    // Create heartbeat
    const leaseMs = handler.estimatedMaxExecutionMs ?? DEFAULT_LEASE_MS
    const heartbeat: LeaseHeartbeat = {
      extend: (extraMs?: number) => {
        asyncTaskRepo.extendLease(task.id, this.workerId, extraMs ?? leaseMs)
      },
    }

    let decision: AsyncTaskDecision
    try {
      decision = await handler.execute(task, heartbeat)
    } catch (err: any) {
      const errorMsg = err?.message || String(err)
      const errorCode = err instanceof CodedError ? err.errorCode : undefined
      console.error(`[AsyncTaskScheduler] Handler '${task.taskType}' crashed:`, errorMsg)
      decision = { action: 'fail', error: errorMsg, retryable: true, errorCode }
    }

    // Apply decision
    this.applyDecision(task, decision)
  }

  private applyDecision(task: AsyncTaskDocument, decision: AsyncTaskDecision): void {
    switch (decision.action) {
      case 'complete':
        asyncTaskRepo.applyDecision(task.id, 'completed', {
          result: decision.result,
        })
        console.log(`[AsyncTaskScheduler] Task ${task.id} (${task.taskType}) completed`)
        break

      case 'reschedule':
        if (task.attempt >= task.maxAttempts) {
          // Core decides timed_out
          asyncTaskRepo.applyDecision(task.id, 'timed_out', {
            patchState: decision.patchState,
            lastError: `Timed out after ${task.attempt} attempts`,
          })
          console.log(`[AsyncTaskScheduler] Task ${task.id} timed out after ${task.attempt} attempts`)
        } else {
          asyncTaskRepo.applyDecision(task.id, 'pending', {
            nextRunAt: decision.nextRunAt,
            patchState: decision.patchState,
          })
        }
        break

      case 'fail': {
        const errPrefix = decision.errorCode ? `[${decision.errorCode}] ` : ''
        if (decision.retryable && task.attempt < task.maxAttempts) {
          // Retryable fail: reschedule with exponential backoff
          const backoffMs = Math.min(300_000, 30_000 * Math.pow(2, task.attempt - 1))
          asyncTaskRepo.applyDecision(task.id, 'pending', {
            nextRunAt: Date.now() + backoffMs,
            lastError: `${errPrefix}${decision.error}`,
          })
          console.log(`[AsyncTaskScheduler] Task ${task.id} failed (retryable), retry in ${Math.round(backoffMs / 1000)}s`)
        } else if (decision.retryable && task.attempt >= task.maxAttempts) {
          asyncTaskRepo.applyDecision(task.id, 'timed_out', {
            lastError: `${errPrefix}${decision.error}`,
          })
        } else {
          asyncTaskRepo.applyDecision(task.id, 'failed', {
            lastError: `${errPrefix}${decision.error}`,
          })
        }
        break
      }

      case 'cancel':
        asyncTaskRepo.applyDecision(task.id, 'cancelled', {
          lastError: decision.reason,
        })
        console.log(`[AsyncTaskScheduler] Task ${task.id} cancelled: ${decision.reason || 'no reason'}`)
        break
    }
  }

  private prune(): void {
    try {
      const pruned = asyncTaskRepo.pruneOld(PRUNE_MAX_AGE)
      if (pruned > 0) {
        console.log(`[AsyncTaskScheduler] Pruned ${pruned} old tasks`)
      }
    } catch (err) {
      console.error('[AsyncTaskScheduler] Prune error:', err)
    }
  }
}

export const asyncTaskScheduler = new AsyncTaskScheduler()

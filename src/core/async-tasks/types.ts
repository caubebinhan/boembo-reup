// ── AsyncTask Core Types ────────────────────────────
// Generic background polling system. DB-persisted, crash-recoverable.
// First consumer: tiktok.publish.verify

export type AsyncTaskStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled'

export interface AsyncTaskDocument {
  id: string
  taskType: string
  dedupeKey: string

  status: AsyncTaskStatus

  /** Immutable input — NO secrets (use accountId, load cookies at runtime) */
  payload: Record<string, any>
  /** Schema version for migration/validation */
  payloadVersion: number
  /** Mutable cursor across retries (handler writes here) */
  state: Record<string, any>
  /** Final outcome (set on complete/fail) */
  result?: Record<string, any>

  /** Incremented atomically on claim (persisted in DB, not memory) */
  attempt: number
  maxAttempts: number
  /** ms timestamp — scheduler polls this */
  nextRunAt: number

  /** e.g. 'tiktok-account:{id}' — limits parallel tasks with same key */
  concurrencyKey?: string
  /** Max tasks with same concurrencyKey running simultaneously (default 1) */
  maxConcurrent?: number

  campaignId?: string
  /** Grouping key (e.g. 'campaign:{id}:publisher') */
  ownerKey?: string

  /** ms timestamp — if running but lease expired, reclaimable */
  leaseUntil?: number
  /** Which scheduler instance claimed it */
  workerId?: string

  lastError?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

// ── Handler Contract ────────────────────────────────

export interface AsyncTaskHandler {
  taskType: string
  /** Estimated max execution time in ms (used for lease duration). Default 300_000 (5min). */
  estimatedMaxExecutionMs?: number
  /** Validate payload before execute. Return error string if invalid, null if ok. */
  validate?(payload: Record<string, any>, payloadVersion: number): string | null
  /** Execute the task. Core already incremented attempt. */
  execute(task: AsyncTaskDocument, heartbeat: LeaseHeartbeat): Promise<AsyncTaskDecision>
}

/** Handler calls heartbeat.extend() during long operations to prevent lease expiry */
export interface LeaseHeartbeat {
  /** Extend lease. Default extends by estimatedMaxExecutionMs. */
  extend(extraMs?: number): void
}

// ── Decision (handler returns this) ─────────────────

export type AsyncTaskDecision =
  | { action: 'complete'; result?: Record<string, any> }
  | { action: 'reschedule'; nextRunAt: number; patchState?: Record<string, any> }
  | { action: 'fail'; error: string; retryable?: boolean; errorCode?: string }
  | { action: 'cancel'; reason?: string }
// Core decides 'timed_out' when attempt >= maxAttempts and handler returns reschedule or fail(retryable)

// ── Schedule Options (for ctx.asyncTasks.schedule) ──

export interface AsyncTaskScheduleOptions {
  dedupeKey: string
  payloadVersion?: number      // default 1
  maxAttempts?: number          // default 6
  startAt?: number           // default now + retryIntervalMs
  retryIntervalMs?: number      // default 120_000 (2 min)
  concurrencyKey?: string
  maxConcurrent?: number        // default 1
  campaignId?: string
  ownerKey?: string
}

export interface AsyncTaskScheduleResult {
  taskId: string
  created: boolean
}

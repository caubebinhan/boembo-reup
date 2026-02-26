import { db } from '../Database'
import { BaseRepo } from './BaseRepo'
import type { AsyncTaskDocument } from '@core/async-tasks/types'

/**
 * Async Task Repository — background polling task queue.
 *
 * Uses atomic claim/lease mechanism to prevent duplicate execution.
 * Deduplication via unique partial index on dedupe_key for active tasks.
 */
export class AsyncTaskRepo extends BaseRepo<AsyncTaskDocument> {
  constructor() {
    super('async_tasks')
  }

  // ── Atomic Claim ────────────────────────────────
  /**
   * Claim due tasks with concurrency check BEFORE claim.
   *
   * 1. SELECT candidates where status='pending' AND next_run_at <= now
   * 2. Filter by concurrency limit (count running tasks per concurrencyKey)
   * 3. CAS UPDATE: SET status='claimed', attempt+1, lease — only if still 'pending'
   */
  claimDue(limit: number, workerId: string, leaseMs: number): AsyncTaskDocument[] {
    return db.transaction(() => {
      const now = Date.now()
      // Over-fetch to account for concurrency filtering
      const candidates = db.prepare(`
        SELECT id, data_json, concurrency_key FROM async_tasks
        WHERE status = 'pending' AND next_run_at <= ?
        ORDER BY next_run_at ASC
        LIMIT ?
      `).all(now, limit * 3) as { id: string; data_json: string; concurrency_key: string | null }[]

      const claimed: AsyncTaskDocument[] = []
      const concurrencyCounts = new Map<string, number>()

      for (const row of candidates) {
        if (claimed.length >= limit) break
        const doc = JSON.parse(row.data_json) as AsyncTaskDocument
        const key = doc.concurrencyKey

        // Concurrency check BEFORE claiming
        if (key) {
          if (!concurrencyCounts.has(key)) {
            const result = db.prepare(`
              SELECT COUNT(*) as cnt FROM async_tasks
              WHERE concurrency_key = ? AND status IN ('claimed', 'running')
            `).get(key) as { cnt: number }
            concurrencyCounts.set(key, result.cnt)
          }
          const maxC = doc.maxConcurrent ?? 1
          if (concurrencyCounts.get(key)! >= maxC) continue
          concurrencyCounts.set(key, concurrencyCounts.get(key)! + 1)
        }

        // CAS: only claim if still pending
        const updated = db.prepare(`
          UPDATE async_tasks
          SET status = 'claimed', worker_id = ?, lease_until = ?,
              attempt = COALESCE(attempt, 0) + 1, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(workerId, now + leaseMs, now, row.id)

        if (updated.changes > 0) {
          // Reflect in returned doc
          doc.status = 'claimed'
          doc.attempt = (doc.attempt || 0) + 1
          doc.workerId = workerId
          doc.leaseUntil = now + leaseMs
          doc.updatedAt = now
          // Sync index columns
          this.syncIndexColumns(doc)
          claimed.push(doc)
        }
      }
      return claimed
    })()
  }

  // ── Lease ───────────────────────────────────────

  /** Reclaim tasks with expired leases (crash recovery) */
  reclaimExpiredLeases(): number {
    const now = Date.now()
    const result = db.prepare(`
      UPDATE async_tasks
      SET status = 'pending', lease_until = NULL, worker_id = NULL, updated_at = ?
      WHERE status IN ('claimed', 'running') AND lease_until < ?
    `).run(now, now)
    return result.changes
  }

  /** Extend lease for a running task */
  extendLease(taskId: string, workerId: string, extraMs: number): boolean {
    const now = Date.now()
    const result = db.prepare(`
      UPDATE async_tasks
      SET lease_until = ?, updated_at = ?
      WHERE id = ? AND worker_id = ? AND status IN ('claimed', 'running')
    `).run(now + extraMs, now, taskId, workerId)
    return result.changes > 0
  }

  // ── Status Updates ──────────────────────────────

  /** Transition claimed → running */
  markRunning(taskId: string): void {
    const now = Date.now()
    db.prepare(`
      UPDATE async_tasks SET status = 'running', updated_at = ?
      WHERE id = ? AND status = 'claimed'
    `).run(now, taskId)
    // Also sync index
    const doc = this.findById(taskId)
    if (doc) this.syncIndexColumns(doc)
  }

  /** Apply decision result to task */
  applyDecision(
    taskId: string,
    status: AsyncTaskDocument['status'],
    updates: {
      nextRunAt?: number
      patchState?: Record<string, any>
      result?: Record<string, any>
      lastError?: string
    }
  ): void {
    const doc = this.findById(taskId)
    if (!doc) return

    doc.status = status
    doc.updatedAt = Date.now()
    doc.leaseUntil = undefined
    doc.workerId = undefined

    if (updates.nextRunAt !== undefined) doc.nextRunAt = updates.nextRunAt
    if (updates.patchState) doc.state = { ...doc.state, ...updates.patchState }
    if (updates.result) doc.result = updates.result
    if (updates.lastError !== undefined) doc.lastError = updates.lastError
    if (status === 'completed' || status === 'failed' || status === 'timed_out' || status === 'cancelled') {
      doc.completedAt = Date.now()
    }

    this.save(doc)
  }

  // ── Concurrency ─────────────────────────────────

  countRunning(concurrencyKey: string): number {
    const result = db.prepare(`
      SELECT COUNT(*) as cnt FROM async_tasks
      WHERE concurrency_key = ? AND status IN ('claimed', 'running')
    `).get(concurrencyKey) as { cnt: number }
    return result?.cnt ?? 0
  }

  // ── Queries ─────────────────────────────────────

  findByCampaign(campaignId: string): AsyncTaskDocument[] {
    const rows = db.prepare(`
      SELECT data_json FROM async_tasks WHERE campaign_id = ? ORDER BY created_at DESC
    `).all(campaignId) as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json))
  }

  findByOwnerKey(ownerKey: string): AsyncTaskDocument[] {
    const rows = db.prepare(`
      SELECT data_json FROM async_tasks WHERE owner_key = ? ORDER BY created_at DESC
    `).all(ownerKey) as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json))
  }

  // ── Dedupe-Aware Insert ─────────────────────────

  /**
   * Insert task if no active task with same dedupeKey exists.
   * Uses UNIQUE partial index for atomicity.
   */
  insertIfNotExists(doc: AsyncTaskDocument): { taskId: string; created: boolean } {
    return db.transaction(() => {
      try {
        this.save(doc)
        return { taskId: doc.id, created: true }
      } catch (err: any) {
        // UNIQUE constraint violation on dedupe_key → already exists
        if (String(err?.message || '').includes('UNIQUE constraint failed')) {
          const existing = db.prepare(`
            SELECT id FROM async_tasks
            WHERE dedupe_key = ? AND status IN ('pending', 'claimed', 'running')
            LIMIT 1
          `).get(doc.dedupeKey) as { id: string } | undefined
          return { taskId: existing?.id || doc.id, created: false }
        }
        throw err
      }
    })()
  }

  // ── Cleanup ─────────────────────────────────────

  /** Remove old completed/failed/timed_out/cancelled tasks */
  pruneOld(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs
    const result = db.prepare(`
      DELETE FROM async_tasks
      WHERE status IN ('completed', 'failed', 'timed_out', 'cancelled')
        AND updated_at < ?
    `).run(cutoff)
    return result.changes
  }

  // ── Index Column Sync ───────────────────────────

  protected override syncIndexColumns(doc: AsyncTaskDocument): void {
    db.prepare(`
      UPDATE async_tasks SET
        task_type = ?, status = ?, dedupe_key = ?,
        concurrency_key = ?, campaign_id = ?, owner_key = ?,
        worker_id = ?, next_run_at = ?, lease_until = ?,
        attempt = ?
      WHERE id = ?
    `).run(
      doc.taskType, doc.status, doc.dedupeKey,
      doc.concurrencyKey ?? null, doc.campaignId ?? null, doc.ownerKey ?? null,
      doc.workerId ?? null, doc.nextRunAt, doc.leaseUntil ?? null,
      doc.attempt, doc.id
    )
  }
}

export const asyncTaskRepo = new AsyncTaskRepo()

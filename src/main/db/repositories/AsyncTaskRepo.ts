import { db } from '../Database'
import { BaseRepo } from './BaseRepo'
import type { AsyncTaskDocument } from '@core/async-tasks/types'

/**
 * Async Task Repository — background polling task queue.
 *
 * Index columns are the single source of truth for query-able fields.
 * data_json stores only non-indexed fields.
 */
export class AsyncTaskRepo extends BaseRepo<AsyncTaskDocument> {
  constructor() {
    super('async_tasks')
  }

  protected override indexedColumnMap(): Record<string, string> {
    return {
      task_type: 'taskType',
      status: 'status',
      dedupe_key: 'dedupeKey',
      concurrency_key: 'concurrencyKey',
      campaign_id: 'campaignId',
      owner_key: 'ownerKey',
      worker_id: 'workerId',
      next_run_at: 'nextRunAt',
      lease_until: 'leaseUntil',
      attempt: 'attempt',
    }
  }

  /** Column list for SELECT queries that need merge */
  private get _cols() {
    return 'data_json, task_type, status, dedupe_key, concurrency_key, campaign_id, owner_key, worker_id, next_run_at, lease_until, attempt'
  }

  // ── Atomic Claim ────────────────────────────────
  claimDue(limit: number, workerId: string, leaseMs: number): AsyncTaskDocument[] {
    return db.transaction(() => {
      const now = Date.now()
      const candidates = db.prepare(`
        SELECT id, ${this._cols} FROM async_tasks
        WHERE status = 'pending' AND next_run_at <= ?
        ORDER BY next_run_at ASC
        LIMIT ?
      `).all(now, limit * 3) as Record<string, any>[]

      const claimed: AsyncTaskDocument[] = []
      const concurrencyCounts = new Map<string, number>()

      for (const row of candidates) {
        if (claimed.length >= limit) break
        const doc = this.mergeIndexedFields(JSON.parse(row.data_json), row)
        const key = doc.concurrencyKey

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

        // CAS: only claim if still pending — update index columns directly
        const updated = db.prepare(`
          UPDATE async_tasks
          SET status = 'claimed', worker_id = ?, lease_until = ?,
              attempt = COALESCE(attempt, 0) + 1, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(workerId, now + leaseMs, now, row.id)

        if (updated.changes > 0) {
          doc.status = 'claimed'
          doc.attempt = (doc.attempt || 0) + 1
          doc.workerId = workerId
          doc.leaseUntil = now + leaseMs
          doc.updatedAt = now
          claimed.push(doc)
        }
      }
      return claimed
    })()
  }

  // ── Lease ───────────────────────────────────────

  reclaimExpiredLeases(): number {
    const now = Date.now()
    const result = db.prepare(`
      UPDATE async_tasks
      SET status = 'pending', lease_until = NULL, worker_id = NULL, updated_at = ?
      WHERE status IN ('claimed', 'running') AND lease_until < ?
    `).run(now, now)
    return result.changes
  }

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

  markRunning(taskId: string): void {
    const now = Date.now()
    db.prepare(`
      UPDATE async_tasks SET status = 'running', updated_at = ?
      WHERE id = ? AND status = 'claimed'
    `).run(now, taskId)
  }

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
      SELECT ${this._cols} FROM async_tasks WHERE campaign_id = ? ORDER BY created_at DESC
    `).all(campaignId) as Record<string, any>[]
    return rows.map(r => this.mergeIndexedFields(JSON.parse(r.data_json), r))
  }

  findByOwnerKey(ownerKey: string): AsyncTaskDocument[] {
    const rows = db.prepare(`
      SELECT ${this._cols} FROM async_tasks WHERE owner_key = ? ORDER BY created_at DESC
    `).all(ownerKey) as Record<string, any>[]
    return rows.map(r => this.mergeIndexedFields(JSON.parse(r.data_json), r))
  }

  // ── Dedupe-Aware Insert ─────────────────────────

  insertIfNotExists(doc: AsyncTaskDocument): { taskId: string; created: boolean } {
    return db.transaction(() => {
      try {
        this.save(doc)
        return { taskId: doc.id, created: true }
      } catch (err: any) {
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

  pruneOld(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs
    const result = db.prepare(`
      DELETE FROM async_tasks
      WHERE status IN ('completed', 'failed', 'timed_out', 'cancelled')
        AND updated_at < ?
    `).run(cutoff)
    return result.changes
  }
}

export const asyncTaskRepo = new AsyncTaskRepo()

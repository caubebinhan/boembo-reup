import { db } from '../Database'
import { BaseRepo } from './BaseRepo'
import type { JobDocument } from '../models/Job'
import * as crypto from 'node:crypto'

/**
 * Job Repository  Eengine job queue.
 *
 * Jobs need cross-campaign queries (findPending for engine tick),
 * so we keep index columns (status, campaign_id, scheduled_at)
 * alongside data_json for indexed lookups.
 */
export class JobRepository extends BaseRepo<JobDocument> {
  constructor() {
    super('jobs')
  }

  // ── Create shorthand ──────────────────────
  createJob(partial: Omit<JobDocument, 'id' | 'created_at' | 'updated_at' | 'status'> & { status?: string }): string {
    const now = Date.now()
    const doc: JobDocument = {
      id: crypto.randomUUID(),
      status: (partial.status as JobDocument['status']) || 'pending',
      created_at: now,
      updated_at: now,
      ...partial,
    } as JobDocument
    this.save(doc)
    return doc.id
  }

  // ── Engine tick: cross-campaign pending query ──
  findPending(limit = 10): JobDocument[] {
    const now = Date.now()
    const rows = db
      .prepare(
        `SELECT data_json FROM jobs
         WHERE status = 'pending' AND scheduled_at <= ?
         ORDER BY scheduled_at ASC LIMIT ?`
      )
      .all(now, limit) as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json))
  }

  // ── By campaign ───────────────────────────
  findByCampaign(campaignId: string): JobDocument[] {
    const rows = db
      .prepare(`SELECT data_json FROM jobs WHERE campaign_id = ? ORDER BY created_at DESC`)
      .all(campaignId) as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json))
  }

  countPendingForCampaign(campaignId: string): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM jobs
         WHERE campaign_id = ? AND status IN ('pending', 'running')`
      )
      .get(campaignId) as { cnt: number }
    return row?.cnt ?? 0
  }

  // ── Status update ─────────────────────────
  updateStatus(id: string, status: string, error?: string): void {
    const doc = this.findById(id)
    if (!doc) return
    const now = Date.now()
    doc.status = status as JobDocument['status']
    doc.updated_at = now
    if (error) doc.error_message = error
    if (status === 'running' && !doc.started_at) doc.started_at = now
    if (status === 'completed' || status === 'failed') doc.completed_at = now
    this.save(doc)
  }

  // ── Reset stuck jobs ──────────────────────
  resetRunningJobs(): JobDocument[] {
    const rows = db
      .prepare(`SELECT data_json FROM jobs WHERE status = 'running'`)
      .all() as { data_json: string }[]
    const jobs = rows.map(r => JSON.parse(r.data_json) as JobDocument)
    for (const job of jobs) {
      job.status = 'pending'
      job.updated_at = Date.now()
      this.save(job)
    }
    return jobs
  }

  // ── Sync index columns alongside data_json ──
  protected override syncIndexColumns(doc: JobDocument): void {
    db.prepare(
      `UPDATE jobs SET status = ?, campaign_id = ?, scheduled_at = ? WHERE id = ?`
    ).run(doc.status, doc.campaign_id, doc.scheduled_at, doc.id)
  }
}

export const jobRepo = new JobRepository()

import { db } from '../Database'
import { BaseRepo } from './BaseRepo'
import type { JobDocument } from '../models/Job'
import * as crypto from 'node:crypto'

/**
 * Job Repository — engine job queue.
 *
 * Index columns (status, campaign_id, scheduled_at) are the single source
 * of truth — NOT duplicated in data_json.
 */
export class JobRepository extends BaseRepo<JobDocument> {
  constructor() {
    super('jobs')
  }

  protected override indexedColumnMap(): Record<string, string> {
    return {
      status: 'status',
      campaign_id: 'campaign_id',
      scheduled_at: 'scheduled_at',
      instance_id: 'instance_id',
    }
  }

  private get _cols() {
    return 'data_json, status, campaign_id, scheduled_at, instance_id'
  }

  // Create shorthand
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

  // Engine tick: cross-campaign pending query
  findPending(limit = 10): JobDocument[] {
    const now = Date.now()
    const rows = db
      .prepare(
        `SELECT ${this._cols} FROM jobs
         WHERE status = 'pending' AND scheduled_at <= ?
         ORDER BY scheduled_at ASC LIMIT ?`
      )
      .all(now, limit) as Record<string, any>[]
    return rows.map(r => this.mergeIndexedFields(JSON.parse(r.data_json), r))
  }

  // By campaign
  findByCampaign(campaignId: string): JobDocument[] {
    const rows = db
      .prepare(`SELECT ${this._cols} FROM jobs WHERE campaign_id = ? ORDER BY created_at DESC`)
      .all(campaignId) as Record<string, any>[]
    return rows.map(r => this.mergeIndexedFields(JSON.parse(r.data_json), r))
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

  // Status update
  updateStatus(id: string, status: string, error?: string, scheduledAt?: number): void {
    const doc = this.findById(id)
    if (!doc) return
    const now = Date.now()
    doc.status = status as JobDocument['status']
    doc.updated_at = now
    if (error) doc.error_message = error
    if (scheduledAt != null) doc.scheduled_at = scheduledAt
    if (status === 'running' && !doc.started_at) doc.started_at = now
    if (status === 'completed' || status === 'failed') doc.completed_at = now
    this.save(doc)
  }

  // Reset stuck jobs
  resetRunningJobs(): JobDocument[] {
    const rows = db
      .prepare(`SELECT ${this._cols} FROM jobs WHERE status = 'running'`)
      .all() as Record<string, any>[]
    const jobs = rows.map(r => this.mergeIndexedFields(JSON.parse(r.data_json), r))
    for (const job of jobs) {
      job.status = 'pending'
      job.updated_at = Date.now()
      this.save(job)
    }
    return jobs
  }
}

export const jobRepo = new JobRepository()

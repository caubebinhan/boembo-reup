import { db } from './Database'

export interface JobRecord {
  id: string
  campaign_id: string
  workflow_id: string
  node_id: string
  instance_id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  data_json: string
  error_message?: string
  scheduled_at?: number
  started_at?: number
  completed_at?: number
}

export class JobQueue {
  static create(job: Partial<JobRecord>): string {
    const id = job.id || require('crypto').randomUUID()
    db.prepare(`
      INSERT INTO jobs (
        id, campaign_id, workflow_id, node_id, instance_id, type, 
        status, data_json, scheduled_at, created_at, updated_at
      ) VALUES (
        @id, @campaign_id, @workflow_id, @node_id, @instance_id, @type,
        @status, @data_json, @scheduled_at, @created_at, @updated_at
      )
    `).run({
      id,
      campaign_id: job.campaign_id,
      workflow_id: job.workflow_id,
      node_id: job.node_id,
      instance_id: job.instance_id,
      type: job.type || 'FLOW_STEP',
      status: job.status || 'pending',
      data_json: job.data_json || '{}',
      scheduled_at: job.scheduled_at || Date.now(),
      created_at: Date.now(),
      updated_at: Date.now()
    })
    return id
  }

  static getPendingJobs(limit: number = 10): JobRecord[] {
    const now = Date.now()
    return db.prepare(`
      SELECT * FROM jobs 
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC LIMIT ?
    `).all(now, limit) as JobRecord[]
  }

  static updateStatus(id: string, status: string, error?: string): void {
    const isEnd = status === 'completed' || status === 'failed'
    db.prepare(`
      UPDATE jobs SET 
        status = @status, 
        error_message = @error, 
        updated_at = @now,
        started_at = COALESCE(started_at, CASE WHEN @status = 'running' THEN @now END),
        completed_at = CASE WHEN @isEnd THEN @now ELSE null END
      WHERE id = @id
    `).run({ id, status, error: error || null, now: Date.now(), isEnd: isEnd ? 1 : 0 })
  }
}

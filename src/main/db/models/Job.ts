// ── Job Document ─────────────────────────────────
export interface JobDocument {
  id: string
  campaign_id: string
  workflow_id: string
  node_id: string
  instance_id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  data: any
  error_message?: string
  scheduled_at: number
  started_at?: number
  completed_at?: number
  created_at: number
  updated_at: number
}

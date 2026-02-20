export interface Campaign {
  id: string
  workflow_id: string
  name: string
  params: Record<string, any> // JSON outputs from wizard
  status: 'idle' | 'running' | 'paused' | 'done' | 'error'
  created_at?: number
  updated_at?: number
}

export interface ContextStats {
  posted: number
  failed: number
  skipped: number
}

export interface Context {
  campaignId: string
  campaign: Campaign
  variables: Record<string, any>
  stats: ContextStats
  emit(event: string, payload: any): void
  resolveParam(template: string | any): any
}

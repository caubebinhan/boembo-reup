import type { FlowDefinition } from '@core/flow/ExecutionContracts'

// ── Video Record ─────────────────────────────────
/**
 * A single video in the campaign's pipeline.
 *
 * Core fields are typed; workflow-specific data goes in `data` (schemaless).
 */
export interface VideoRecord {
  platform_id: string
  status: string
  publish_url?: string
  local_path?: string
  /** Schemaless — workflow-specific video metadata */
  data: Record<string, any>
  scheduled_for?: number
  queue_index?: number
  [key: string]: any
}

// ── Alert Record ─────────────────────────────────
export interface AlertRecord {
  instance_id?: string
  node_id?: string
  level: 'info' | 'warn' | 'error' | 'success'
  title: string
  body?: string
  created_at: number
}

// ── Campaign Counters ────────────────────────────
export interface CampaignCounters {
  queued: number
  downloaded: number
  published: number
  failed: number
  [key: string]: number
}

// ── Campaign Document ────────────────────────────
export interface CampaignDocument {
  id: string
  name: string
  workflow_id: string
  workflow_version: string
  status: string
  /** Schemaless — all workflow-specific config (wizard output) */
  params: Record<string, any>
  /** Frozen flow definition at creation time */
  flow_snapshot: FlowDefinition | null

  videos: VideoRecord[]
  alerts: AlertRecord[]
  counters: CampaignCounters
  last_processed_index: number

  /** Schemaless metadata bag for workflow-specific runtime state */
  meta: Record<string, any>

  created_at: number
  updated_at: number
}

// ── Factory ──────────────────────────────────────
export function createCampaignDocument(
  partial: Partial<CampaignDocument> & { id: string; name: string; workflow_id: string }
): CampaignDocument {
  const now = Date.now()
  return {
    workflow_version: '1.0',
    status: 'idle',
    params: {},
    flow_snapshot: null,
    videos: [],
    alerts: [],
    counters: { queued: 0, downloaded: 0, published: 0, failed: 0 },
    last_processed_index: 0,
    meta: {},
    created_at: now,
    updated_at: now,
    ...partial,
  }
}

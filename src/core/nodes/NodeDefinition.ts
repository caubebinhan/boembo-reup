import type { CampaignStore } from '@main/db/repositories/CampaignRepo'
import type { AsyncTaskScheduleOptions, AsyncTaskScheduleResult } from '../async-tasks/types'

// ── Config Schema ────────────────────────────────
export interface NodeConfigSchemaField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select' | 'account_picker'
  required?: boolean
  default?: any
  options?: Array<{ value: string; label: string }>
  description?: string
}

export interface NodeConfigSchema {
  fields: NodeConfigSchemaField[]
}

// ── Execution Context & Result ───────────────────
export interface NodeExecutionContext {
  campaign_id: string
  job_id?: string
  /** Campaign params from wizard */
  params: Record<string, any>
  /** Mutable campaign document store (videos, alerts, counters) */
  store: CampaignStore
  logger: {
    info(msg: string): void
    error(msg: string, err?: any): void
  }
  onProgress(msg: string): void
  /** Emit a structured alert to the campaign's alert panel */
  alert(level: 'info' | 'warn' | 'error' | 'success', title: string, body?: string): void
  /** Schedule background async tasks (fire-and-forget, DB-persisted) */
  asyncTasks: {
    schedule(
      taskType: string,
      payload: Record<string, any>,
      options: AsyncTaskScheduleOptions,
    ): AsyncTaskScheduleResult
  }
}


/** What a node returns to control the flow */
export interface NodeExecutionResult {
  /** Data to pass to the next node */
  data: any
  /** Flow control action */
  action?: 'continue' | 'recall' | 'finish'
  /** If action='recall', which instance_id to jump back to */
  recall_target?: string
  /** Human-readable message for logs */
  message?: string
}

// ── Node Manifest (Contract) ─────────────────────
/** Declarative metadata — describes WHAT the node is, not HOW it runs */
export interface NodeManifest {
  id: string
  name: string
  /** Short display label for visualizer (defaults to name if omitted) */
  label?: string
  /** Hex color used in visualizer cards and edges */
  color?: string
  category: 'source' | 'filter' | 'transform' | 'publish' | 'control'
  icon?: string
  description?: string
  /** Schema for config UI (optional) */
  config_schema?: NodeConfigSchema
  /** Settings editable in the visualizer InspectPanel */
  editable_settings?: NodeConfigSchema
  /** Event name to emit when user saves editable_settings */
  on_save_event?: string
}

// ── Node Definition ──────────────────────────────
/** Complete node: manifest (contract) + execute (backend) */
export interface NodeDefinition {
  manifest: NodeManifest
  execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult>
}

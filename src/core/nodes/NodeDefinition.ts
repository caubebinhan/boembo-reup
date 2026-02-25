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
  /** Campaign params from wizard (all settings saved to DB) */
  params: Record<string, any>
  logger: {
    info(msg: string): void
    error(msg: string, err?: any): void
  }
  onProgress(msg: string): void
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
  category: 'source' | 'filter' | 'transform' | 'publish' | 'control'
  icon?: string
  description?: string
  /** Schema for config UI (optional — used by wizard auto-generation) */
  config_schema?: NodeConfigSchema
  /** Settings editable in the visualizer InspectPanel (auto-rendered form) */
  editable_settings?: NodeConfigSchema
  /** Event name to emit when user saves editable_settings (e.g. 'reschedule') */
  on_save_event?: string
}

// ── Node Definition ──────────────────────────────
/** Complete node: manifest (contract) + execute (backend) */
export interface NodeDefinition {
  manifest: NodeManifest
  execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult>
}

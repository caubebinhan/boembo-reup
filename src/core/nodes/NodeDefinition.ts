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

export interface NodeDefinition {
  id: string
  name: string
  category: 'source' | 'filter' | 'transform' | 'publish' | 'control'
  icon?: string

  /** Schema for config UI (optional — used by wizard auto-generation) */
  config_schema?: NodeConfigSchema

  /** The node's execution logic. Receives input from previous node + context. */
  execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult>
}

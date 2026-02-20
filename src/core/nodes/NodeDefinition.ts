import { NodeExecution } from '../flow/ExecutionContracts'

export interface NodeConfigSchemaField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select' | 'account_picker'
  required?: boolean
  default?: any
  options?: Array<{ value: string; label: string }>
  description?: string
  show_if?: string
}

export interface NodeConfigSchema {
  fields: NodeConfigSchemaField[]
}

export interface NodeExecutionContext {
  campaign_id: string
  job_id?: string
  config: Record<string, any>
  variables: Record<string, any>
  logger: {
    info(msg: string): void
    error(msg: string, err?: any): void
  }
  onProgress(msg: string): void
}

export interface NodeExecutionResult {
  type: string
  data: any
  emit_mode?: 'batch' | 'each'
}

export interface NodeDefinition {
  id: string
  name: string
  category: 'source' | 'filter' | 'transform' | 'publish'
  icon?: string
  version?: string
  
  default_execution: NodeExecution
  config_schema?: NodeConfigSchema
  
  input_type?: string | null
  output_type?: string | null

  execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult>
}

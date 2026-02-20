export interface FlowDefinition {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  version: string
  nodes: FlowNodeDefinition[]
  edges: FlowEdgeDefinition[]
  ui?: WorkflowUIDescriptor
}

export interface FlowNodeDefinition {
  node_id: string
  instance_id: string
  config: Record<string, any>
  execution: NodeExecution
  position?: { x: number; y: number }
}

export interface FlowEdgeDefinition {
  from_instance: string
  to_instance: string
}

export type NodeExecutionStrategy = 'inline' | 'scheduled_recurring' | 'per_item_job'

export interface NodeExecution {
  strategy: NodeExecutionStrategy
  job_type?: string
  initial_trigger?: string
  repeat_after?: any
  stop_repeat_if?: string
  on_resume?: string
  gap_between_items?: any
  respect_daily_window?: boolean
  depends_on?: string
  retry?: {
    max: number
    backoff: 'linear' | 'exponential'
    base_delay_ms: number
    max_delay_ms?: number
  }
  create_downstream_job?: string
}

export interface WorkflowUIDescriptor {
  campaign_card?: {
    stats?: any[]
    status_badges?: any[]
    subtitle_expr?: string
    progress?: any
  }
  card_actions?: any[]
  wizard?: {
    steps: any[]
  }
  detail_page?: any
  node_status_cards?: any[]
}

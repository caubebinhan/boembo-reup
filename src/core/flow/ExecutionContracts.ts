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
  /** Inline node-level params from flow.yaml — merged into NodeExecutionContext.params by the engine */
  params?: Record<string, any>
  /** Only for loop nodes — which children to iterate */
  children?: string[]
  /** Per-node error handling: skip (default) | stop_campaign | retry */
  on_error?: 'skip' | 'stop_campaign' | 'retry'
  /** Runtime execution timeout in ms. If undefined, relies on global or infinite timeout */
  timeout?: number
  /** Event handlers: { 'captcha:detected': { action: 'skip_item', emit: 'campaign:needs_captcha' } } */
  events?: Record<string, { action: 'skip_item' | 'pause_campaign' | 'stop_campaign'; emit?: string }>
  /** Runtime execution state (populated by engine) */
  execution?: any
}

export interface FlowEdgeDefinition {
  from: string
  to: string
  /** Optional JS expression evaluated against result.data — edge only followed when truthy.
   *  Available variables: all top-level keys from data (e.g. `status`, `published`, etc.)
   *  Example: "status === 'violation'"  or  "published === true"
   */
  when?: string
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
}

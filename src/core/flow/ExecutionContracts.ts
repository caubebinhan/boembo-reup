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
  /** Service endpoints this workflow requires — checked at startup */
  health_checks?: Array<{ name: string; url: string }>
}

export interface FlowNodeDefinition {
  node_id: string
  instance_id: string
  /** Inline node-level params from flow.yaml — merged into NodeExecutionContext.params by the engine */
  params?: Record<string, any>
  /** Managed sub-nodes: children for loop nodes, branches for parallel fork/join */
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

// ── Execution Trace Bus Contracts ────────────────────────────────

/**
 * Typed trace event emitted on `execution:trace` for every execution log entry.
 *
 * Provides a single, typed stream that RuntimeProjectionService
 * (or any main-process listener) can consume to build runtime projections
 * without polling DB or scraping IPC events.
 *
 * Backward compatible: existing events (campaign:*, node:event) are still
 * emitted as before. `execution:trace` is additive.
 */
export interface TraceEntry {
  /** Trace category for fast routing */
  category: 'node' | 'campaign' | 'loop' | 'job'
  /** Specific event type within the category */
  event: string
  /** Campaign this trace belongs to */
  campaignId: string
  /** Node instance that produced this trace (if applicable) */
  instanceId?: string
  /** Node type id (if applicable) */
  nodeId?: string
  /** Job that produced this trace (if applicable) */
  jobId?: string
  /** Human-readable message */
  message: string
  /** Structured payload — varies by event */
  data?: any
  /** Timestamp */
  timestamp: number
}

/**
 * Pause checkpoint metadata — saved to campaign doc when paused.
 * Used by RuntimeProjectionService to show "Paused at ..." in UI.
 */
export interface PauseCheckpoint {
  itemIndex: number
  entityKey?: string
  lastActiveChild?: string
  lastProgressMessage?: string
  reason: 'manual' | 'event' | 'network' | 'disk'
  eventKey?: string
  timestamp: number
}


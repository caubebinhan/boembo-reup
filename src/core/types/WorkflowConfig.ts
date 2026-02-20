export interface NodeConfig {
  id: string
  node: string // e.g. "ForEach", "TikTokChannelScanner"
  params: Record<string, any>
  condition?: string
  on_success?: string
  on_empty?: {
    action: string
  }
  body?: NodeConfig[] // For ForEach, etc.
}

export interface WorkflowConfig {
  id: string
  name: string
  description?: string
  pipeline: NodeConfig[]
}

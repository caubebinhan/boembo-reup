export interface NodeResult {
  status: string // "posted" | "failed" | "downloaded" | "empty" | "skipped" | ...
  data?: Record<string, any>
  error?: string
}

export interface INode {
  id: string
  type: string
  params: Record<string, any>
  execute(ctx: any): Promise<NodeResult>
}

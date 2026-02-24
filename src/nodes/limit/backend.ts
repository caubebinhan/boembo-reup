import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const videos = Array.isArray(input) ? input : (input.videos || [])
  const max = ctx.params.limit?.max || ctx.params.max_videos || 100
  const result = videos.slice(0, max)
  ctx.logger.info(`Limit: ${videos.length} -> ${result.length}`)
  return { data: result }
}

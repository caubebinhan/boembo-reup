import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  try {
    const videos = Array.isArray(input) ? input : (input.videos || [])
    const max = ctx.params.maxVideos ?? 100
    const result = videos.slice(0, max)
    ctx.logger.info(`Limit: ${videos.length} -> ${result.length}`)
    return { data: result }
  } catch (err: any) {
    ctx.logger.error(`[Limit] Unexpected error: ${err?.message || err}`)
    throw err
  }
}

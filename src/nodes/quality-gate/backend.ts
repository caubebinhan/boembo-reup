import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { CodedError, isCodedError } from '@core/errors/CodedError'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  try {
    const videos = Array.isArray(input) ? input : (input.videos || [])
    const minViews = ctx.params.quality?.min_views || 0
    const minLikes = ctx.params.quality?.min_likes || 0
    const minDuration = ctx.params.quality?.min_duration_seconds || 0
    const maxDuration = ctx.params.quality?.max_duration_seconds || 0

    const result = videos.filter((v: any) => {
      if (minViews > 0 && (v.stats?.views || 0) < minViews) return false
      if (minLikes > 0 && (v.stats?.likes || 0) < minLikes) return false
      if (minDuration > 0 && (v.duration_seconds || 0) < minDuration) return false
      if (maxDuration > 0 && (v.duration_seconds || 0) > maxDuration) return false
      return true
    })

    ctx.logger.info(`QualityFilter: ${videos.length} -> ${result.length}`)
    return { data: result }
  } catch (err: any) {
    ctx.logger.error(`[QualityFilter] Unexpected error: ${err?.message || err}`)
    throw isCodedError(err) ? err : new CodedError('DG-000', err?.message || String(err), err)
  }
}

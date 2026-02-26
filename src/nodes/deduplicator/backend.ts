import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  if (!video?.platform_id) {
    ctx.logger.info('Dedup: no platform_id, passing through')
    return { data: video }
  }

  // Check if already processed in this campaign's videos
  const existing = ctx.store.findVideo(video.platform_id)
  if (existing && ['published', 'verified', 'downloaded'].includes(existing.status)) {
    ctx.logger.info(`Dedup: skipping ${video.platform_id} (already ${existing.status})`)
    return { data: null, action: 'continue', message: 'Duplicate -> skipped' }
  }

  ctx.logger.info(`Dedup: ${video.platform_id} is new`)
  return { data: video }
}

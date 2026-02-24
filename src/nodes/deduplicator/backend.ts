import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  if (!video?.platform_id) {
    ctx.logger.info('Dedup: no platform_id, passing through')
    return { data: video }
  }

  try {
    const existing = db.prepare(
      `SELECT id FROM videos WHERE platform_id = ? AND campaign_id = ? AND status IN ('published','verified','downloaded')`
    ).get(video.platform_id, ctx.campaign_id) as any

    if (existing) {
      ctx.logger.info(`Dedup: skipping ${video.platform_id} (already processed)`)
      return { data: null, action: 'continue', message: 'Duplicate -> skipped' }
    }
  } catch (err) {
    ctx.logger.error('Dedup DB check failed', err)
  }

  ctx.logger.info(`Dedup: ${video.platform_id} is new`)
  return { data: video }
}

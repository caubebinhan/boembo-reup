import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

/**
 * CampaignFinish Node
 *
 * After the loop completes, marks the campaign as 'finished',
 * calculates final stats, and marks remaining queued videos as 'skipped'.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const videos = ctx.store.videos

  // Calculate stats from campaign document
  const stats = {
    total: videos.length,
    published: videos.filter(v => v.status === 'published' || v.status === 'verified').length,
    failed: videos.filter(v => v.status === 'failed').length,
    skipped: videos.filter(v => v.status === 'skipped' || v.status === 'duplicate').length,
    remaining: videos.filter(v => v.status === 'queued').length,
  }

  // Mark remaining queued videos as skipped
  if (stats.remaining > 0) {
    for (const v of videos) {
      if (v.status === 'queued') v.status = 'skipped'
    }
  }

  ctx.store.status = 'finished'
  ctx.store.save()

  const summary = `🏁 Campaign finished — ${stats.published} published, ${stats.failed} failed, ${stats.skipped} skipped (${stats.total} total)`

  ctx.logger.info(`[CampaignFinish] ${summary}`)
  ctx.onProgress(summary)

  return { data: input, action: 'finish', message: summary }
}

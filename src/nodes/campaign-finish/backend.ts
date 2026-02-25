import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'

/**
 * CampaignFinish Node
 *
 * Placed after the loop. When all videos have been processed,
 * this node marks the campaign as 'finished', updates final stats,
 * and marks all remaining 'queued' videos as 'skipped'.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const campaignId = ctx.campaign_id

  // Final stats from DB
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'published' OR status = 'verified' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status IN ('skipped', 'duplicate') THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as remaining
    FROM videos WHERE campaign_id = ?
  `).get(campaignId) as any

  // Mark any remaining queued videos as skipped
  if (stats?.remaining > 0) {
    db.prepare(`UPDATE videos SET status = 'skipped' WHERE campaign_id = ? AND status = 'queued'`)
      .run(campaignId)
  }

  // Update campaign status to finished
  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('finished', campaignId)

  const summary = `🏁 Campaign finished — ${stats?.published || 0} published, ${stats?.failed || 0} failed, ${stats?.skipped || 0} skipped (${stats?.total || 0} total)`

  ctx.logger.info(`[CampaignFinish] ${summary}`)
  ctx.onProgress(summary)

  return { data: input, action: 'finish', message: summary }
}

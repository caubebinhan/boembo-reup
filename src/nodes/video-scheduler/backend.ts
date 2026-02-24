import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { nextValidSlot } from '../_shared/timeWindow'
import { ExecutionLogger } from '../../core/engine/ExecutionLogger'

/**
 * VideoScheduler Node
 *
 * Receives scanned videos from the scanner node, calculates a `scheduled_for`
 * timestamp for each video based on interval + active time window, saves them
 * to the `videos` DB table, and passes the array to the loop node.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const videos = Array.isArray(input) ? input : (input.videos || input.items || [])

  if (videos.length === 0) {
    ctx.logger.info('[VideoScheduler] No videos to schedule')
    return { data: videos, action: 'continue', message: 'No videos to schedule' }
  }

  // Read schedule params from campaign wizard
  const intervalMinutes = ctx.params.intervalMinutes ?? ctx.params.schedule?.interval_minutes ?? 1
  const activeStart = ctx.params.activeHoursStart ?? ctx.params.schedule?.start_time ?? '00:00'
  const activeEnd = ctx.params.activeHoursEnd ?? ctx.params.schedule?.end_time ?? '23:59'
  const activeDays: number[] = ctx.params.activeDays ?? ctx.params.schedule?.active_days ?? [0, 1, 2, 3, 4, 5, 6]

  const intervalMs = intervalMinutes * 60 * 1000

  ctx.logger.info(`[VideoScheduler] Scheduling ${videos.length} videos (interval=${intervalMinutes}min, window=${activeStart}–${activeEnd})`)
  ctx.onProgress(`📋 Scheduling ${videos.length} videos...`)

  // Reset last_processed_index for a fresh run
  db.prepare('UPDATE campaigns SET last_processed_index = 0 WHERE id = ?').run(ctx.campaign_id)

  // Use INSERT OR REPLACE — works regardless of PK structure
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO videos (platform_id, campaign_id, status, scheduled_for, queue_index, data_json)
    VALUES (?, ?, 'queued', ?, ?, ?)
  `)

  let cursor = Date.now()

  const transaction = db.transaction(() => {
    for (let i = 0; i < videos.length; i++) {
      // Find next valid slot within the active time window
      cursor = nextValidSlot(cursor, activeStart, activeEnd, activeDays)

      const video = videos[i]
      video.scheduled_for = cursor
      video.queue_index = i

      upsert.run(
        video.platform_id || video.id,
        ctx.campaign_id,
        cursor,
        i,
        JSON.stringify(video)
      )

      // Advance cursor by interval for next video
      cursor += intervalMs
    }
  })

  transaction()

  // Update campaign queued count
  db.prepare('UPDATE campaigns SET queued_count = ? WHERE id = ?').run(videos.length, ctx.campaign_id)

  // Emit event so detail UI knows about the queued count
  ExecutionLogger.log({
    campaign_id: ctx.campaign_id,
    instance_id: 'scheduler_1',
    node_id: 'core.video_scheduler',
    level: 'info',
    event: 'videos:queued',
    message: `📋 ${videos.length} videos queued on timeline`,
  })

  const firstTime = new Date(videos[0].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const lastTime = new Date(videos[videos.length - 1].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  ctx.logger.info(`[VideoScheduler] ${videos.length} videos scheduled: ${firstTime} → ${lastTime}`)
  ctx.onProgress(`✅ ${videos.length} videos queued (${firstTime} → ${lastTime})`)

  return { data: videos, action: 'continue', message: `${videos.length} videos scheduled` }
}

import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { normalizeTimeRanges, nextValidSlot } from '../_shared/timeWindow'

/**
 * VideoScheduler Node
 *
 * Calculates scheduled_for timestamps for each video using campaign time ranges.
 * Saves to campaign document via CampaignStore.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const videos = Array.isArray(input) ? input : (input.videos || input.items || [])

  if (videos.length === 0) {
    ctx.logger.info('[VideoScheduler] No videos to schedule')
    return { data: videos, action: 'continue', message: 'No videos to schedule' }
  }

  const intervalMinutes = ctx.params.intervalMinutes ?? 60
  const intervalMs = intervalMinutes * 60 * 1000

  const ranges = normalizeTimeRanges(ctx.params)
  const rangeDesc = ranges.length === 1
    ? `${ranges[0].start}–${ranges[0].end}`
    : `${ranges.length} ranges`

  ctx.logger.info(`[VideoScheduler] Scheduling ${videos.length} videos (interval=${intervalMinutes}min, window=${rangeDesc})`)
  ctx.onProgress(`📋 Scheduling ${videos.length} videos...`)

  // Reset last_processed_index for a fresh run
  ctx.store.lastProcessedIndex = 0

  let cursor = Date.now()

  const scheduledVideos = videos.map((video: any, i: number) => {
    cursor = nextValidSlot(cursor, ranges)
    const record = {
      platform_id: video.platform_id || video.id,
      status: 'queued',
      data: video,
      scheduled_for: cursor,
      queue_index: i,
    }
    video.scheduled_for = cursor
    video.queue_index = i
    cursor += intervalMs
    return record
  })

  // Save to campaign document
  ctx.store.setVideos(scheduledVideos)
  ctx.store.setCounter('queued', videos.length)
  ctx.store.save()

  // Detect missed jobs: videos whose scheduled_for is already in the past
  const now = Date.now()
  const missedVideos = scheduledVideos.filter(v => v.scheduled_for < now)

  if (missedVideos.length > 0) {
    // Reschedule missed videos starting from now
    let rescheduleCursor = now
    let rescheduledCount = 0
    for (const v of missedVideos) {
      rescheduleCursor = nextValidSlot(rescheduleCursor, ranges)
      ctx.store.updateVideo(v.platform_id, { scheduled_for: rescheduleCursor })
      rescheduleCursor += intervalMs
      rescheduledCount++
    }
    ctx.store.save()

    const alertMsg = `Phát hiện ${missedVideos.length} video bị missed. Đã reschedule ${rescheduledCount} video từ thời điểm hiện tại.`
    ctx.logger.info(`[VideoScheduler] ⚠️ ${alertMsg}`)
    ctx.alert('warn', `⚠️ Detected ${missedVideos.length} missed job${missedVideos.length > 1 ? 's' : ''}`, `Rescheduled ${rescheduledCount} video${rescheduledCount > 1 ? 's' : ''} starting from now`)
  }

  const firstTime = new Date(videos[0].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const lastTime = new Date(videos[videos.length - 1].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  ctx.logger.info(`[VideoScheduler] ${videos.length} videos scheduled: ${firstTime} → ${lastTime}`)
  ctx.onProgress(`✅ ${videos.length} videos queued (${firstTime} → ${lastTime})`)

  return { data: videos, action: 'continue', message: `${videos.length} videos scheduled` }
}

import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { normalizeTimeRanges } from '../_shared/timeWindow'
import { computeScheduleSlots, scheduleVideos } from '@shared/scheduling'

/**
 * VideoScheduler Node
 *
 * Calculates scheduled_for timestamps for each video using campaign time ranges.
 * Supports: firstRunAt gate, enableJitter, autoSchedule per-source.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  let videos = Array.isArray(input) ? input : (input.videos || input.items || [])

  if (videos.length === 0) {
    ctx.logger.info('[VideoScheduler] No videos to schedule')
    return { data: videos, action: 'continue', message: 'No videos to schedule' }
  }

  // ── Deduplicate by platform_id (safety net) ──
  {
    const seen = new Set<string>()
    const before = videos.length
    videos = videos.filter((v: any) => {
      const pid = v.platform_id || v.id
      if (!pid || seen.has(pid)) return false
      seen.add(pid)
      return true
    })
    if (videos.length < before) {
      ctx.logger.info(`[VideoScheduler] Deduped: ${before} → ${videos.length} unique videos`)
    }
  }

  const intervalMinutes = ctx.params.intervalMinutes ?? 60
  const intervalMs = intervalMinutes * 60 * 1000
  const enableJitter = ctx.params.enableJitter === true

  const ranges = normalizeTimeRanges(ctx.params)
  const rangeDesc = ranges.length === 1
    ? `${ranges[0].start}?${ranges[0].end}`
    : `${ranges.length} ranges`

  ctx.logger.info(`[VideoScheduler] Scheduling ${videos.length} videos (interval=${intervalMinutes}min, jitter=${enableJitter}, window=${rangeDesc})`)
  ctx.onProgress(`?? Scheduling ${videos.length} videos...`)

  // Reset last_processed_index for a fresh run
  ctx.store.lastProcessedIndex = 0

  // Respect firstRunAt: if set and in the future, use as cursor start
  let cursor = Date.now()
  if (ctx.params.firstRunAt) {
    const firstRunMs = new Date(ctx.params.firstRunAt).getTime()
    if (!isNaN(firstRunMs) && firstRunMs > cursor) {
      ctx.logger.info(`[VideoScheduler] Using firstRunAt as start: ${new Date(firstRunMs).toLocaleString('vi-VN')}`)
      cursor = firstRunMs
    }
  }

  // Compute schedule slots using shared function
  const slots = computeScheduleSlots({
    cursor,
    intervalMinutes,
    enableJitter,
    ranges,
    count: videos.length,
  })

  const scheduledVideos = videos.map((video: any, i: number) => {
    // Per-source autoSchedule check
    const sourceAutoSchedule = video.source_meta?.autoSchedule !== false
    const status = sourceAutoSchedule ? 'queued' : 'pending_approval'

    const record = {
      platform_id: video.platform_id || video.id,
      status,
      data: video,
      scheduled_for: slots[i].timestamp,
      queue_index: i,
    }
    video.scheduled_for = slots[i].timestamp
    video.queue_index = i
    return record
  })

  // Count by status
  const queuedCount = scheduledVideos.filter(v => v.status === 'queued').length
  const pendingCount = scheduledVideos.filter(v => v.status === 'pending_approval').length

  // Save to campaign document
  ctx.store.setVideos(scheduledVideos)
  ctx.store.setCounter('queued', queuedCount)
  ctx.store.save()

  if (pendingCount > 0) {
    ctx.logger.info(`[VideoScheduler] ${pendingCount} videos set to pending_approval (autoSchedule=false)`)
  }

  // Detect missed jobs: videos whose scheduled_for is already in the past
  const now = Date.now()
  const missedVideos = scheduledVideos.filter(v => v.scheduled_for < now && v.status === 'queued')

  if (missedVideos.length > 0) {
    // Reschedule using shared function (respects time slots + jitter)
    const rescheduled = scheduleVideos(missedVideos, {
      intervalMinutes,
      enableJitter,
      ranges,
    })
    for (const r of rescheduled) {
      ctx.store.updateVideo(r.platform_id, { scheduled_for: r.scheduled_for })
    }
    ctx.store.save()

    ctx.logger.info(`[VideoScheduler] ?? Rescheduled ${rescheduled.length} missed videos`)
    ctx.alert('warn', `?? Detected ${missedVideos.length} missed job${missedVideos.length > 1 ? 's' : ''}`, `Rescheduled ${rescheduled.length} video${rescheduled.length > 1 ? 's' : ''} starting from now`)
  }

  const firstTime = new Date(videos[0].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const lastTime = new Date(videos[videos.length - 1].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  ctx.logger.info(`[VideoScheduler] ${videos.length} videos scheduled: ${firstTime} -> ${lastTime}`)
  ctx.onProgress(`? ${videos.length} videos queued (${firstTime} -> ${lastTime})`)

  return { data: videos, action: 'continue', message: `${videos.length} videos scheduled` }
}


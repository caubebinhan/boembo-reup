import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { normalizeTimeRanges } from '../_shared/timeWindow'
import { computeScheduleSlots, scheduleVideos } from '@shared/scheduling'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'

const INSTANCE_ID = 'scheduler_1'

/**
 * VideoScheduler Node
 *
 * Calculates scheduled_for timestamps for each video using campaign time ranges.
 * Supports: firstRunAt gate, enableJitter, autoSchedule per-source.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  try {
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
    const enableJitter = ctx.params.enableJitter === true

    const ranges = normalizeTimeRanges(ctx.params)
    const rangeDesc = ranges.length === 1
      ? `${ranges[0].start}?${ranges[0].end}`
      : `${ranges.length} ranges`

    ctx.logger.info(`[VideoScheduler] Scheduling ${videos.length} videos (interval=${intervalMinutes}min, jitter=${enableJitter}, window=${rangeDesc})`)
    ctx.onProgress(`Scheduling ${videos.length} videos...`)

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

    // Count pending_approval for logging
    const pendingCount = scheduledVideos.filter(v => v.status === 'pending_approval').length

    // Save to campaign document (merge — preserves status of already-processed videos)
    ctx.store.upsertVideos(scheduledVideos)
    ctx.store.save()

    // Emit structured event per video
    for (const sv of scheduledVideos) {
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, INSTANCE_ID, 'scheduler:scheduled', {
        videoId: sv.platform_id,
        scheduledFor: sv.scheduled_for,
        queueIndex: sv.queue_index,
      })
    }

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
        ExecutionLogger.emitNodeEvent(ctx.campaign_id, INSTANCE_ID, 'scheduler:rescheduled', {
          videoId: r.platform_id, newTime: r.scheduled_for, reason: 'missed',
        })
      }
      ctx.store.save()

      ctx.logger.info(`[VideoScheduler] Rescheduled ${rescheduled.length} missed videos`)
      ctx.alert('warn', `⏰ Phát hiện ${missedVideos.length} video bị lỡ lịch`, `Đã reschedule ${rescheduled.length} video từ bây giờ (interval=${intervalMinutes}min, jitter=${enableJitter ? 'on' : 'off'})`)
    }

    const firstTime = new Date(videos[0].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    const lastTime = new Date(videos[videos.length - 1].scheduled_for).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    ctx.logger.info(`[VideoScheduler] ${videos.length} videos scheduled: ${firstTime} -> ${lastTime}`)
    ctx.onProgress(`${videos.length} videos queued (${firstTime} -> ${lastTime})`)

    return { data: videos, action: 'continue', message: `${videos.length} videos scheduled` }
  } catch (err: any) {
    ctx.logger.error(`[VideoScheduler] Unexpected error: ${err?.message || err}`)
    throw err
  }
}

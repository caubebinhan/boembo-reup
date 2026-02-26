import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import { jobRepo } from '@main/db/repositories/JobRepo'
import { PipelineEventBus } from '@core/engine/PipelineEventBus'
import { flowEngine } from '@core/engine/FlowEngine'
import { normalizeTimeRanges } from '@nodes/_shared/timeWindow'
import { scheduleVideos } from '@shared/scheduling'

/**
 * Crash Recovery for tiktok-repost workflow.
 * Handles: stuck jobs, missed scheduled videos, under_review retries, re-triggering.
 */
export function recover(campaignId: string): void {
  const tag = `[Recovery:tiktok-repost:${campaignId}]`
  try {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return

    const params = store.params
    const now = Date.now()

    // 1. Handle missed queued videos (scheduled_for in the past)
    const missedVideos = store.videosByStatus('queued')
      .filter(v => v.scheduled_for != null && v.scheduled_for < now)
      .sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0))

    if (missedVideos.length > 0) {
      const handling = params.missedJobHandling || 'auto'

      if (handling === 'manual') {
        // Manual mode: pause campaign and alert the user
        console.log(`${tag} Manual mode — pausing campaign (${missedVideos.length} missed videos)`)
        campaignRepo.updateStatus(campaignId, 'paused')

        store.addAlert({
          instance_id: 'scheduler_1',
          node_id: 'core.video_scheduler',
          level: 'warn',
          title: `⏸ ${missedVideos.length} video bị missed — campaign đã tạm dừng`,
          body: 'Kiểm tra lại và resume campaign khi sẵn sàng.',
        })

        PipelineEventBus.emit('pipeline:info', {
          message: `[Manual] Paused campaign ${campaignId}: ${missedVideos.length} missed videos`,
        })

        store.save()
        return // Don't reschedule or re-trigger
      }

      // Auto mode (default): reschedule using shared helper (respects time slots + jitter)
      const ranges = normalizeTimeRanges(params)
      const rescheduled = scheduleVideos(missedVideos, {
        intervalMinutes: params.intervalMinutes ?? 1,
        enableJitter: params.enableJitter === true,
        ranges,
      })
      for (const r of rescheduled) {
        store.updateVideo(r.platform_id, { scheduled_for: r.scheduled_for })
      }

      console.log(`${tag} Rescheduled ${rescheduled.length} missed videos`)
      PipelineEventBus.emit('pipeline:info', {
        message: `Rescheduled ${rescheduled.length} missed videos for campaign ${campaignId}`,
      })

      // Emit alert for the Alert Panel
      store.addAlert({
        instance_id: 'scheduler_1',
        node_id: 'core.video_scheduler',
        level: 'warn',
        title: `⏰ Detected ${missedVideos.length} missed video(s)`,
        body: `Rescheduled from now (interval=${params.intervalMinutes ?? 1}min, jitter=${params.enableJitter ? 'on' : 'off'})`,
      })
    }

    // 2. Handle under_review videos — reset to 'queued' for retry
    const underReviewVideos = store.videosByStatus('under_review')
    if (underReviewVideos.length > 0) {
      console.log(`${tag} Found ${underReviewVideos.length} under_review videos — resetting to queued`)
      for (const v of underReviewVideos) {
        v.status = 'queued'
      }
      console.log(`${tag} Reset ${underReviewVideos.length} under_review → queued for retry`)
    }

    store.save()

    // 3. Re-trigger if no pending/running jobs
    const pendingCount = jobRepo.countPendingForCampaign(campaignId)
    if (pendingCount === 0) {
      console.log(`${tag} No pending jobs — re-triggering campaign`)
      flowEngine.triggerCampaign(campaignId)
    }
  } catch (err) {
    console.error(`${tag} Recovery failed:`, err)
  }
}

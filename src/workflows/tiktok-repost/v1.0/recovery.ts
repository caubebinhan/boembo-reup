import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import { jobRepo } from '@main/db/repositories/JobRepo'
import { PipelineEventBus } from '@core/engine/PipelineEventBus'
import { flowEngine } from '@core/engine/FlowEngine'

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

    // 1. Reschedule missed queued videos (scheduled_for in the past)
    const missedVideos = store.videosByStatus('queued')
      .filter(v => v.scheduled_for != null && v.scheduled_for < now)
      .sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0))

    if (missedVideos.length > 0) {
      const intervalMs = (params.intervalMinutes ?? 1) * 60_000
      let cursor = now
      for (const v of missedVideos) {
        v.scheduled_for = cursor
        cursor += intervalMs
      }
      console.log(`${tag} Rescheduled ${missedVideos.length} missed videos`)
      PipelineEventBus.emit('pipeline:info', {
        message: `Rescheduled ${missedVideos.length} missed videos for campaign ${campaignId}`,
      })

      // Emit alert for the Alert Panel
      store.addAlert({
        instance_id: 'scheduler_1',
        node_id: 'core.video_scheduler',
        level: 'warn',
        title: `⏰ Detected ${missedVideos.length} missed video(s)`,
        body: `Rescheduled from now (interval=${(params.intervalMinutes ?? 1)}min)`,
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

import { db } from '../../main/db/Database'
import { PipelineEventBus } from '../../core/engine/PipelineEventBus'
import { flowEngine } from '../../core/engine/FlowEngine'

/**
 * Crash Recovery for tiktok-repost workflow.
 * Handles: stuck jobs, missed scheduled videos, under_review retries, re-triggering.
 */
export function recover(campaignId: string): void {
  const tag = `[Recovery:tiktok-repost:${campaignId}]`
  try {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any
    if (!campaign) return
    const params = (() => { try { return JSON.parse(campaign.params || '{}') } catch { return {} } })()

    // 1. Reschedule missed queued videos (scheduled_for in the past)
    const now = Date.now()
    const missedVideos = db.prepare(
      `SELECT platform_id FROM videos
       WHERE campaign_id = ? AND status = 'queued' AND scheduled_for IS NOT NULL AND scheduled_for < ?
       ORDER BY queue_index ASC`
    ).all(campaignId, now) as any[]

    if (missedVideos.length > 0) {
      const intervalMs = (params.intervalMinutes ?? 1) * 60_000
      let cursor = now
      for (const v of missedVideos) {
        db.prepare('UPDATE videos SET scheduled_for = ? WHERE platform_id = ? AND campaign_id = ?')
          .run(cursor, v.platform_id, campaignId)
        cursor += intervalMs
      }
      console.log(`${tag} Rescheduled ${missedVideos.length} missed videos`)
      PipelineEventBus.emit('pipeline:info', {
        message: `Rescheduled ${missedVideos.length} missed videos for campaign ${campaignId}`
      })
    }

    // 2. Handle under_review videos — these were mid-retry-loop when app crashed
    const underReviewVideos = db.prepare(
      `SELECT v.platform_id, v.publish_url, v.data_json FROM videos v
       WHERE v.campaign_id = ? AND v.status = 'under_review'`
    ).all(campaignId) as any[]

    if (underReviewVideos.length > 0) {
      console.log(`${tag} Found ${underReviewVideos.length} under_review videos — will be retried on next run`)
      // Mark them back to 'queued' so the loop picks them up again
      // The publisher's account_dedup will see them in publish_history and resume verification
      for (const v of underReviewVideos) {
        db.prepare(`UPDATE videos SET status = 'queued' WHERE platform_id = ? AND campaign_id = ?`)
          .run(v.platform_id, campaignId)
      }
      console.log(`${tag} Reset ${underReviewVideos.length} under_review → queued for retry`)
    }

    // 3. Re-trigger if no pending/running jobs
    const pendingCount = (db.prepare(
      `SELECT COUNT(*) as cnt FROM jobs WHERE campaign_id = ? AND status IN ('pending', 'running')`
    ).get(campaignId) as any)?.cnt ?? 0

    if (pendingCount === 0) {
      console.log(`${tag} No pending jobs — re-triggering campaign`)
      flowEngine.triggerCampaign(campaignId)
    }
  } catch (err) {
    console.error(`${tag} Recovery failed:`, err)
  }
}

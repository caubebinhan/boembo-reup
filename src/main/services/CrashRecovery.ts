import { db } from '../db/Database'
import { PipelineEventBus } from '../../core/engine/PipelineEventBus'
import { flowEngine } from '../../core/engine/FlowEngine'

export class CrashRecoveryService {
  static recoverPendingTasks() {
    console.log('Scanning for pending/interrupted tasks for crash recovery...')
    try {
      // 1. Reset any jobs stuck in 'running' state (app crashed mid-execution)
      const runningJobs = db.prepare(`SELECT * FROM jobs WHERE status = 'running'`).all() as any[]
      if (runningJobs.length > 0) {
        console.log(`Recovering ${runningJobs.length} interrupted job tasks...`)
        for (const job of runningJobs) {
          db.prepare(`UPDATE jobs SET status = 'pending' WHERE id = ?`).run(job.id)
          PipelineEventBus.emit('pipeline:info', {
            message: `Recovered job ${job.id} to "pending" status after crash`
          })
        }
      } else {
        console.log('No interrupted jobs found.')
      }

      // 2. Detect & reschedule missed videos
      // Videos that were queued with a scheduled_for time that has already passed
      const now = Date.now()
      const missedVideos = db.prepare(
        `SELECT v.*, c.params FROM videos v
         JOIN campaigns c ON c.id = v.campaign_id
         WHERE v.status = 'queued' AND v.scheduled_for IS NOT NULL AND v.scheduled_for < ?
         AND c.status = 'active'`
      ).all(now) as any[]

      if (missedVideos.length > 0) {
        console.log(`[CrashRecovery] Found ${missedVideos.length} missed videos — rescheduling from now`)

        // Group by campaign to apply per-campaign interval
        const byCampaign = new Map<string, any[]>()
        for (const v of missedVideos) {
          const list = byCampaign.get(v.campaign_id) || []
          list.push(v)
          byCampaign.set(v.campaign_id, list)
        }

        for (const [campaignId, videos] of byCampaign) {
          const params = (() => { try { return JSON.parse(videos[0].params || '{}') } catch { return {} } })()
          const intervalMs = (params.intervalMinutes ?? 1) * 60_000
          let cursor = now

          for (const v of videos) {
            db.prepare('UPDATE videos SET scheduled_for = ? WHERE platform_id = ? AND campaign_id = ?')
              .run(cursor, v.platform_id, campaignId)
            cursor += intervalMs
          }

          console.log(`[CrashRecovery] Rescheduled ${videos.length} missed videos for campaign ${campaignId}`)
          PipelineEventBus.emit('pipeline:info', {
            message: `Rescheduled ${videos.length} missed videos for campaign ${campaignId}`
          })
        }
      }

      // 3. Re-trigger active campaigns that have no pending/running jobs
      // This handles: app closed while loop was mid-execution → no jobs left in DB
      // Deduplicator will skip already-processed videos, so re-triggering is safe.
      const activeCampaigns = db.prepare(`SELECT id FROM campaigns WHERE status = 'active'`).all() as any[]
      for (const campaign of activeCampaigns) {
        const pendingCount = (db.prepare(
          `SELECT COUNT(*) as cnt FROM jobs WHERE campaign_id = ? AND status IN ('pending', 'running')`
        ).get(campaign.id) as any)?.cnt ?? 0

        if (pendingCount === 0) {
          console.log(`[CrashRecovery] Active campaign ${campaign.id} has no pending jobs — re-triggering`)
          flowEngine.triggerCampaign(campaign.id)
        }
      }
    } catch (err) {
      console.error('Failed to run crash recovery', err)
    }
  }
}


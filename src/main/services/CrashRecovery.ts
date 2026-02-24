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

      // 2. Re-trigger active campaigns that have no pending/running jobs
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


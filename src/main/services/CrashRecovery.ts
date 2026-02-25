import { db } from '../db/Database'
import { PipelineEventBus } from '../../core/engine/PipelineEventBus'

/**
 * Crash Recovery Service — orchestrator.
 *
 * 1. Generic: reset all stuck 'running' jobs to 'pending'
 * 2. Per-workflow: delegates to registered recovery handlers
 * 3. Runs each workflow's recover(campaignId) for active campaigns
 */
export class CrashRecoveryService {
  private static recoveryModules = new Map<string, { recover: (campaignId: string) => void }>()

  /**
   * Register a recovery handler for a workflow ID.
   * Called by the auto-discovery import in main/index.ts
   */
  static registerRecovery(workflowId: string, handler: { recover: (campaignId: string) => void }) {
    this.recoveryModules.set(workflowId, handler)
    console.log(`[CrashRecovery] Registered recovery for workflow: ${workflowId}`)
  }

  static recoverPendingTasks() {
    console.log('Scanning for pending/interrupted tasks for crash recovery...')
    try {
      // ── Step 1: Generic — reset stuck 'running' jobs ──────────
      const runningJobs = db.prepare(`SELECT * FROM jobs WHERE status = 'running'`).all() as any[]
      if (runningJobs.length > 0) {
        console.log(`[CrashRecovery] Resetting ${runningJobs.length} stuck running jobs → pending`)
        for (const job of runningJobs) {
          db.prepare(`UPDATE jobs SET status = 'pending' WHERE id = ?`).run(job.id)
          PipelineEventBus.emit('pipeline:info', {
            message: `Recovered job ${job.id} to "pending" status after crash`
          })
        }
      } else {
        console.log('[CrashRecovery] No stuck running jobs found.')
      }

      // ── Step 2: Per-workflow recovery ─────────────────────────
      const activeCampaigns = db.prepare(
        `SELECT id, workflow_id FROM campaigns WHERE status = 'active'`
      ).all() as any[]

      for (const campaign of activeCampaigns) {
        const handler = this.recoveryModules.get(campaign.workflow_id)
        if (handler?.recover) {
          console.log(`[CrashRecovery] Running ${campaign.workflow_id} recovery for campaign ${campaign.id}`)
          try {
            handler.recover(campaign.id)
          } catch (err) {
            console.error(`[CrashRecovery] ${campaign.workflow_id} recovery failed for ${campaign.id}:`, err)
          }
        } else {
          // Fallback: just re-trigger if no pending jobs
          const pendingCount = (db.prepare(
            `SELECT COUNT(*) as cnt FROM jobs WHERE campaign_id = ? AND status IN ('pending', 'running')`
          ).get(campaign.id) as any)?.cnt ?? 0

          if (pendingCount === 0) {
            console.log(`[CrashRecovery] No handler for ${campaign.workflow_id}, re-triggering campaign ${campaign.id}`)
            const { flowEngine } = require('../../core/engine/FlowEngine')
            flowEngine.triggerCampaign(campaign.id)
          }
        }
      }
    } catch (err) {
      console.error('[CrashRecovery] Failed to run crash recovery:', err)
    }
  }
}

import { jobRepo } from '../db/repositories/JobRepo'
import { campaignRepo } from '../db/repositories/CampaignRepo'
import { publishHistoryRepo } from '../db/repositories/PublishHistoryRepo'
import { PipelineEventBus } from '@core/engine/PipelineEventBus'

/**
 * Crash Recovery Service - orchestrator.
 *
 * 1. Generic: reset all stuck 'running' jobs to 'pending'
 * 2. Per-workflow: delegates to registered recovery handlers
 * 3. Runs each workflow's recover(campaignId) for active campaigns
 */
export class CrashRecoveryService {
  private static recoveryModules = new Map<string, { recover: (campaignId: string) => void }>()

  static registerRecovery(workflowId: string, handler: { recover: (campaignId: string) => void }) {
    this.recoveryModules.set(workflowId, handler)
    console.log(`[CrashRecovery] Registered recovery for workflow: ${workflowId}`)
  }

  static recoverPendingTasks() {
    console.log('Scanning for pending/interrupted tasks for crash recovery...')
    try {
      // Step 1: Reset stuck 'running' jobs
      const resetJobs = jobRepo.resetRunningJobs()
      if (resetJobs.length > 0) {
        console.log(`[CrashRecovery] Reset ${resetJobs.length} stuck running jobs -> pending`)
        for (const job of resetJobs) {
          PipelineEventBus.emit('pipeline:info', {
            message: `Recovered job ${job.id} to "pending" status after crash`,
          })
        }
      } else {
        console.log('[CrashRecovery] No stuck running jobs found.')
      }

      // Step 1b: Clean up stale 'uploading' claims in publish_history
      // These are crash artifacts that would cause false duplicate detection.
      try {
        const cleaned = publishHistoryRepo.cleanupStaleUploadingClaims(30 * 60 * 1000)
        if (cleaned > 0) {
          console.log(`[CrashRecovery] Cleaned ${cleaned} stale uploading claim(s) from publish_history`)
        }
      } catch (err) {
        console.error('[CrashRecovery] Failed to clean stale uploading claims:', err)
      }

      // Step 2: Per-workflow recovery for active campaigns
      const activeCampaigns = campaignRepo.findByStatus('active')

      for (const campaign of activeCampaigns) {
        // Try version-aware key first (workflowId@version), fallback to plain workflowId
        const version = campaign.workflow_version
        const versionKey = version ? `${campaign.workflow_id}@${version}` : null
        const handler = (versionKey && this.recoveryModules.get(versionKey)) || this.recoveryModules.get(campaign.workflow_id)
        if (handler?.recover) {
          console.log(`[CrashRecovery] Running ${campaign.workflow_id} recovery for campaign ${campaign.id}`)
          try {
            handler.recover(campaign.id)
          } catch (err) {
            console.error(`[CrashRecovery] ${campaign.workflow_id} recovery failed for ${campaign.id}:`, err)
          }
        } else {
          // Fallback: re-trigger if no pending jobs
          const pendingCount = jobRepo.countPendingForCampaign(campaign.id)
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

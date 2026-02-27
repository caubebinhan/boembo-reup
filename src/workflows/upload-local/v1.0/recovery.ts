import { jobRepo } from '@main/db/repositories/JobRepo'
import { flowEngine } from '@core/engine/FlowEngine'

/**
 * Crash Recovery for upload-local workflow.
 * Simple: just re-trigger if no pending jobs.
 */
export function recover(campaignId: string): void {
  const tag = `[Recovery:upload-local:${campaignId}]`
  try {
    const pendingCount = jobRepo.countPendingForCampaign(campaignId)
    if (pendingCount === 0) {
      console.log(`${tag} No pending jobs - re-triggering campaign`)
      flowEngine.triggerCampaign(campaignId)
    }
  } catch (err) {
    console.error(`${tag} Recovery failed:`, err)
  }
}

import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import { FlowDefinition } from './ExecutionContracts'
import { flowLoader } from './FlowLoader'

/**
 * FlowResolver - resolves the correct flow definition for a campaign.
 *
 * Priority:
 *   1. Campaign's flow_snapshot (pinned at creation time)
 *   2. Latest flow (fallback for pre-migration campaigns)
 */
export class FlowResolver {
  static resolve(campaignId: string): FlowDefinition | null {
    try {
      const doc = campaignRepo.findById(campaignId)
      if (!doc) return null

      return doc.flow_snapshot ?? flowLoader.get(doc.workflow_id)
    } catch {
      return null
    }
  }
}

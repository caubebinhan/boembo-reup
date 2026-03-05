/**
 * core.join — Join/Barrier node.
 *
 * Waits for all (or any) parallel branches in a group to complete
 * before continuing the flow.
 *
 * The engine's `executeJob` detects `action: 'wait'` and reschedules
 * the join job with a short delay until the barrier condition is met.
 *
 * YAML usage:
 *   - node_id: core.join
 *     instance_id: publish_join
 *     children: [tiktok_pub, youtube_pub]
 *     params:
 *       mode: all        # 'all' (default) | 'any'
 *       onBranchFail: continue  # 'fail_all' | 'continue' (default: continue)
 *
 * Input data must contain `_parallelGroup` (UUID) set by the fork node.
 * The join node queries the job repo for branch completion status.
 */
import type { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from './NodeDefinition'
import { jobRepo } from '@main/db/repositories/JobRepo'

const JoinNode: NodeDefinition = {
  manifest: {
    id: 'core.join',
    name: 'Join Barrier',
    label: '⊕ Join',
    color: '#7c3aed',
    category: 'control',
    icon: '⊕',
    description: 'Wait for parallel branches to complete before continuing',
  },

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const parallelGroup = input?._parallelGroup
    if (!parallelGroup) {
      ctx.logger.error('JoinNode: missing _parallelGroup in input — cannot determine branch status')
      return { action: 'continue', data: input, message: 'No parallel group — passthrough' }
    }

    const mode: 'all' | 'any' = ctx.params?.mode || 'all'
    const onBranchFail: 'fail_all' | 'continue' = ctx.params?.onBranchFail || 'continue'
    const branches: string[] = ctx.params?.branches || []

    if (branches.length === 0) {
      ctx.logger.error('JoinNode: no branches specified')
      return { action: 'continue', data: input, message: 'No branches — passthrough' }
    }

    // Query branch job statuses from job repo
    const branchJobs = branches.map(branchId => {
      // Find the latest job for this branch in this parallel group
      const jobs = jobRepo.findByCampaign(ctx.campaign_id)
        .filter(j =>
          j.instance_id === branchId &&
          j.data?._parallelGroup === parallelGroup
        )
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      return { branchId, job: jobs[0] || null }
    })

    const completed = branchJobs.filter(b => b.job?.status === 'completed')
    const failed = branchJobs.filter(b => b.job?.status === 'failed')
    const pending = branchJobs.filter(b => !b.job || b.job.status === 'pending' || b.job.status === 'running')

    // Check failure policy
    if (failed.length > 0 && onBranchFail === 'fail_all') {
      const failedNames = failed.map(b => b.branchId).join(', ')
      ctx.logger.error(`JoinNode: branches [${failedNames}] failed — failing group`)
      return {
        action: 'continue',
        data: {
          ...input,
          _joinResult: 'failed',
          _branchResults: Object.fromEntries(branchJobs.map(b => [b.branchId, b.job?.status || 'missing'])),
        },
        message: `Join failed: branches [${failedNames}] failed`,
      }
    }

    // Check barrier condition
    const barrierMet = mode === 'all'
      ? pending.length === 0  // all branches settled (completed or failed)
      : completed.length > 0  // at least one completed

    if (!barrierMet) {
      // Not ready — tell engine to reschedule
      const waitMsg = mode === 'all'
        ? `Waiting for ${pending.length}/${branches.length} branches`
        : `Waiting for any branch to complete`
      ctx.logger.info(waitMsg)
      return { action: 'wait', data: input, message: waitMsg }
    }

    // Barrier met — merge results and continue
    const branchResults: Record<string, any> = {}
    for (const b of branchJobs) {
      branchResults[b.branchId] = {
        status: b.job?.status || 'missing',
        data: b.job?.data || null,
      }
    }

    const joinResult = failed.length > 0 ? 'partial' : 'success'
    ctx.logger.info(`Join complete (${joinResult}): ${completed.length} completed, ${failed.length} failed`)

    return {
      action: 'continue',
      data: {
        ...input,
        _joinResult: joinResult,
        _branchResults: branchResults,
      },
      message: `Join ${joinResult}: ${completed.length}/${branches.length} branches completed`,
    }
  },
}

export default JoinNode

import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import {
  type SyntheticGroup,
  logCheckMap,
  failedChecks,
  ok,
  fail,
} from '../_base'
import { buildCampaignSyntheticEvaluation } from './synthetic/campaign'
import { buildAsyncVerifySyntheticEvaluation } from './synthetic/asyncVerify'
import { buildCompatSyntheticEvaluation } from './synthetic/compat'
import { buildRecoverySyntheticEvaluation } from './synthetic/recovery'
import { buildTransformSyntheticEvaluation } from './synthetic/transform'
import { buildThumbnailSyntheticEvaluation } from './synthetic/thumbnail'
import { buildNetworkSyntheticEvaluation } from './synthetic/network'

const SYNTHETIC_PREFIX_GROUPS: Array<{ prefix: string; group: SyntheticGroup }> = [
  { prefix: 'tiktok-repost-v1.campaign.', group: 'campaign' },
  { prefix: 'tiktok-repost-v1.async-verify.', group: 'async_verify' },
  { prefix: 'tiktok-repost-v1.compat.', group: 'compat' },
  { prefix: 'tiktok-repost-v1.recovery.', group: 'recovery' },
  { prefix: 'tiktok-repost-v1.network.', group: 'network' },
]

const EXTRA_CAMPAIGN_SYNTHETIC_CASE_IDS = new Set<string>([
  'tiktok-repost-v1.loop.resume-last-processed-index',
])

const TRANSFORM_SYNTHETIC_CASE_IDS = new Set<string>([
  'tiktok-repost-v1.transform.null-input-guard',
  'tiktok-repost-v1.transform.on-error-continue-policy',
  'tiktok-repost-v1.transform-pipeline.field-integrity-db-assert',
])

const THUMBNAIL_SYNTHETIC_CASE_IDS = new Set<string>([
  'tiktok-repost-v1.thumbnail.ui-render-preview',
  'tiktok-repost-v1.thumbnail.bulk-mixed-shapes-grid-snapshot',
])

export function runSyntheticGroupCase(
  caseId: string,
  group: SyntheticGroup,
  options?: TroubleshootingCaseRunOptions
): TroubleshootingRunResultLike {
  const logger = options?.logger
  const evaluation = (() => {
    if (group === 'campaign') return buildCampaignSyntheticEvaluation(caseId)
    if (group === 'async_verify') return buildAsyncVerifySyntheticEvaluation(caseId)
    if (group === 'compat') return buildCompatSyntheticEvaluation(caseId)
    if (group === 'recovery') return buildRecoverySyntheticEvaluation(caseId)
    if (group === 'transform') return buildTransformSyntheticEvaluation(caseId)
    if (group === 'thumbnail') return buildThumbnailSyntheticEvaluation(caseId)
    return buildNetworkSyntheticEvaluation(caseId)
  })()

  logCheckMap(logger, `Synthetic:${group}`, evaluation.checks)
  const failed = failedChecks(evaluation.checks)

  if (failed.length > 0) {
    return fail(`Synthetic ${group} fixture failed for ${caseId}`, {
      errors: [`Failed checks: ${failed.join(', ')}`],
      result: evaluation.result,
      artifacts: evaluation.artifacts,
    })
  }

  return ok(evaluation.summary, {
    messages: evaluation.messages,
    result: evaluation.result,
    artifacts: evaluation.artifacts,
  })
}

export function resolveSyntheticGroup(caseId: string): SyntheticGroup | null {
  for (const entry of SYNTHETIC_PREFIX_GROUPS) {
    if (caseId.startsWith(entry.prefix)) return entry.group
  }
  if (EXTRA_CAMPAIGN_SYNTHETIC_CASE_IDS.has(caseId)) return 'campaign'
  if (TRANSFORM_SYNTHETIC_CASE_IDS.has(caseId)) return 'transform'
  if (THUMBNAIL_SYNTHETIC_CASE_IDS.has(caseId)) return 'thumbnail'
  return null
}

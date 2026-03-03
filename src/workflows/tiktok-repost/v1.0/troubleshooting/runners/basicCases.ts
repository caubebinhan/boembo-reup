import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import {
  runWizardSourcesMainValidationCase,
  runDebugPanelWorkflowFilterSmokeCase,
  runCampaignCreateSmokeCase,
  runCampaignDetailUiOpenSnapshotCase,
  runCaptionSourceFallbackCase,
  runCaptionGeneratedOverrideCase,
  runCaptionUnicodeHashtagPreserveCase,
  runTransformChainSmokeCase,
  runTransformConditionSkipItemCase,
  runWizardSourcesEdgeGapCase,
} from './basic/textCases'
import {
  runScannerFilterThresholdsFixtureCase,
  runScannerChannelSmokeCase,
  runScannerEmptyChannelCase,
  runScannerSessionExpiredCase,
  runScannerRescanDedupeExistingItemsCase,
} from './basic/scanCases'
import {
  runThumbnailNormalizeStringCase,
  runThumbnailNormalizeNestedObjectCase,
  runThumbnailMalformedPayloadFallbackCase,
  runThumbnailDetailUiCodepathContractCase,
} from './basic/thumbnailCases'
import {
  resolveSyntheticGroup,
  runSyntheticGroupCase,
} from './basic/syntheticCases'

type CaseHandler = (
  options?: TroubleshootingCaseRunOptions
) => Promise<TroubleshootingRunResultLike | null> | TroubleshootingRunResultLike | null

const CASE_HANDLER_MAP = new Map<string, CaseHandler>([
  ['tiktok-repost-v1.debug-panel.workflow-filter-smoke', runDebugPanelWorkflowFilterSmokeCase],

  ['tiktok-repost-v1.campaign.create-smoke', runCampaignCreateSmokeCase],
  ['tiktok-repost-v1.campaign.detail-ui-open-snapshot', runCampaignDetailUiOpenSnapshotCase],

  ['tiktok-repost-v1.caption.source-fallback', runCaptionSourceFallbackCase],
  ['tiktok-repost-v1.caption.generated-override', runCaptionGeneratedOverrideCase],
  ['tiktok-repost-v1.caption.unicode-hashtag-preserve', runCaptionUnicodeHashtagPreserveCase],

  ['tiktok-repost-v1.transform.chain-smoke', runTransformChainSmokeCase],
  ['tiktok-repost-v1.transform.condition-skip-item', runTransformConditionSkipItemCase],

  ['tiktok-repost-v1.scan.wizard-sources-main-validation', runWizardSourcesMainValidationCase],
  ['tiktok-repost-v1.scan.channel-smoke', runScannerChannelSmokeCase],
  ['tiktok-repost-v1.scan.empty-channel', runScannerEmptyChannelCase],
  ['tiktok-repost-v1.scan.session-expired', runScannerSessionExpiredCase],
  ['tiktok-repost-v1.scan.rescan-dedupe-existing-items', runScannerRescanDedupeExistingItemsCase],
  ['tiktok-repost-v1.scan.wizard-sources-edge-validation-gaps', runWizardSourcesEdgeGapCase],
  ['tiktok-repost-v1.scan.filter-thresholds-fixture', runScannerFilterThresholdsFixtureCase],

  ['tiktok-repost-v1.thumbnail.normalize-string', runThumbnailNormalizeStringCase],
  ['tiktok-repost-v1.thumbnail.normalize-nested-object', runThumbnailNormalizeNestedObjectCase],
  ['tiktok-repost-v1.thumbnail.malformed-payload-fallback', runThumbnailMalformedPayloadFallbackCase],
  ['tiktok-repost-v1.thumbnail.detail-ui-codepath-contract', runThumbnailDetailUiCodepathContractCase],
])

export const REGISTERED_HANDLER_COUNT = CASE_HANDLER_MAP.size

export async function runBasicTiktokRepostCase(
  caseId: string,
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike | null> {
  const handler = CASE_HANDLER_MAP.get(caseId)
  if (handler) return handler(options)

  const syntheticGroup = resolveSyntheticGroup(caseId)
  if (syntheticGroup) return runSyntheticGroupCase(caseId, syntheticGroup, options)

  console.warn(`[Troubleshooting] No handler registered for caseId: ${caseId} (DG-901)`)
  return null
}

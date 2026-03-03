import type {
  TroubleshootingCaseId,
  TroubleshootingCaseRuntimeOptions,
  TroubleshootingCaseRunOptions,
  TroubleshootingRunResultLike,
  WorkflowTroubleshootingProvider,
} from '@main/services/troubleshooting/types'
import { debugDashboardVerify, runFullPublishE2ETest, runPublishTest } from '@main/tiktok/publisher/test-publish'
import { tiktokRepostV1Cases } from './cases'
import { runBasicTiktokRepostCase } from './runners/basicCases'

function withCaseEnvelope(
  caseId: TroubleshootingCaseId,
  result: TroubleshootingRunResultLike,
  runtime?: TroubleshootingCaseRuntimeOptions
): TroubleshootingRunResultLike {
  const def = tiktokRepostV1Cases.find(c => c.id === caseId)
  const baseMessages = Array.isArray(result.messages) ? result.messages : []
  const baseErrors = Array.isArray(result.errors) ? result.errors : []
  const summaryMessage = result.summary ? [`Summary: ${result.summary}`] : []
  return {
    ...result,
    params: {
      ...(result.params || {}),
      workflowId: def?.workflowId || 'tiktok-repost',
      workflowVersion: def?.workflowVersion || '1.0',
      caseId,
      risk: def?.risk,
      implemented: def?.implemented !== false,
      selectedAccountId: runtime?.accountId || undefined,
      selectedAccountUsername: result.accountUsername || undefined,
      selectedVideoLocalPath: runtime?.videoLocalPath || undefined,
      selectedVideoPlatformId: runtime?.videoPlatformId || undefined,
      selectedVideoCampaignId: runtime?.videoCampaignId || undefined,
      selectedSourceName: runtime?.sourceName || undefined,
      selectedSourceType: runtime?.sourceType || undefined,
      selectedSourceCampaignId: runtime?.sourceCampaignId || undefined,
      randomSeed: runtime?.randomSeed || undefined,
    },
    checks: result.checks || def?.meta?.checks,
    messages: result.success
      ? [...baseMessages, ...summaryMessage]
      : baseMessages,
    errors: result.success
      ? baseErrors
      : [
        ...baseErrors,
        ...(typeof (result.result as any)?.error === 'string' ? [(result.result as any).error] : []),
      ],
  }
}

function runtimePublishOpts(options?: TroubleshootingCaseRunOptions) {
  return {
    logger: options?.logger,
    accountId: options?.runtime?.accountId,
    videoLocalPath: options?.runtime?.videoLocalPath,
    videoPlatformId: options?.runtime?.videoPlatformId,
    videoCampaignId: options?.runtime?.videoCampaignId,
    randomSeed: options?.runtime?.randomSeed,
  }
}

async function runTiktokRepostV1Case(
  caseId: TroubleshootingCaseId,
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike | null> {
  if (caseId === 'tiktok-repost-v1.smoke.tiktok-studio') {
    return withCaseEnvelope(caseId, await runPublishTest(runtimePublishOpts(options)), options?.runtime)
  }
  if (caseId === 'tiktok-repost-v1.publish.dashboard-verify') {
    return withCaseEnvelope(caseId, await debugDashboardVerify(runtimePublishOpts(options)), options?.runtime)
  }
  if (caseId === 'tiktok-repost-v1.publish.tiktok-publish-e2e') {
    return withCaseEnvelope(caseId, await runFullPublishE2ETest(runtimePublishOpts(options)), options?.runtime)
  }

  const basic = await runBasicTiktokRepostCase(caseId, options)
  if (basic) {
    return withCaseEnvelope(caseId, basic, options?.runtime)
  }

  return null
}

export const troubleshootingProvider: WorkflowTroubleshootingProvider = {
  workflowId: 'tiktok-repost',
  workflowVersion: '1.0',
  cases: tiktokRepostV1Cases,
  runCase: runTiktokRepostV1Case,
}

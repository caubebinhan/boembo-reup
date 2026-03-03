import { createCampaignDocument } from '@main/db/models/Campaign'
import { CampaignStore } from '@main/db/repositories/CampaignRepo'
import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { log, safeRead, lineOf, ok, fail, FILE_PATHS } from '../../_base'

const DETAIL_FILE = FILE_PATHS.DETAIL
export async function runCampaignCreateSmokeCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger

  const mockFlowSnapshot = {
    id: 'tiktok-repost',
    name: 'TikTok Repost',
    version: '1.0',
    nodes: [],
    edges: [],
  }

  const doc = createCampaignDocument({
    id: `campaign-smoke-${Date.now()}`,
    name: 'Campaign Create Smoke',
    workflow_id: 'tiktok-repost',
    workflow_version: '1.0',
    flow_snapshot: mockFlowSnapshot as any,
    params: { name: 'Campaign Create Smoke' },
  })

  let persisted: any = null
  const store = new CampaignStore(doc, {
    save(nextDoc: any) {
      persisted = JSON.parse(JSON.stringify(nextDoc))
    },
  } as any)
  store.save()

  const checks = {
    workflowId: doc.workflow_id === 'tiktok-repost',
    workflowVersion: doc.workflow_version === '1.0',
    flowSnapshotPresent: !!doc.flow_snapshot && doc.flow_snapshot.id === 'tiktok-repost',
    countersDefault:
      doc.counters.queued === 0 &&
      doc.counters.downloaded === 0 &&
      doc.counters.published === 0 &&
      doc.counters.failed === 0,
    metaDefault: !!doc.meta && typeof doc.meta === 'object' && !Array.isArray(doc.meta),
    persistedWorkflowVersion: persisted?.workflow_version === '1.0',
    persistedFlowSnapshot: !!persisted?.flow_snapshot,
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[CampaignCreateSmoke] ${key}=${okFlag}`)
  })

  const missing = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    campaign: {
      id: doc.id,
      workflowId: doc.workflow_id,
      workflowVersion: doc.workflow_version,
      flowSnapshotId: (doc.flow_snapshot as any)?.id,
    },
  }

  if (missing.length > 0) {
    return fail('Campaign create smoke fixture failed persistence contract checks', {
      errors: [`Failed checks: ${missing.join(', ')}`],
      result,
    })
  }

  return ok('Campaign create smoke fixture passed workflow/version/flow_snapshot contract checks', {
    messages: [
      'workflow_id/workflow_version/flow_snapshot are present and persisted via store.save()',
      'Default counters/meta contract remains intact for new campaign docs',
    ],
    result,
  })
}

export async function runCampaignDetailUiOpenSnapshotCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const detailSource = safeRead(DETAIL_FILE)

  const fixtureCampaign = createCampaignDocument({
    id: `campaign-detail-ui-${Date.now()}`,
    name: 'Campaign Detail UI Snapshot Fixture',
    workflow_id: 'tiktok-repost',
    workflow_version: '1.0',
    videos: [],
    counters: { queued: 0, downloaded: 0, published: 0, failed: 0 },
  })

  const checks = {
    fixtureWorkflowId: fixtureCampaign.workflow_id === 'tiktok-repost',
    fixtureWorkflowVersion: fixtureCampaign.workflow_version === '1.0',
    hasDbVideoFetch: detailSource.includes("window.api.invoke('campaign:get-videos'"),
    hasDbLogFetch: detailSource.includes("window.api.invoke('campaign:get-logs'"),
    hasEmptyStateText: detailSource.includes('No videos yet. Run the campaign to start.'),
    hasCounterScanned: detailSource.includes("{ label: 'Scanned', value: state.scannedCount"),
    hasCounterQueued: detailSource.includes("{ label: 'Queued', value: state.queuedCount"),
    hasCounterPublished: detailSource.includes("{ label: 'Published', value: state.publishedCount"),
    hasCounterFailed: detailSource.includes("{ label: 'Failed', value: state.failedCount"),
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[CampaignDetailUiSnapshot] ${key}=${okFlag}`)
  })

  const missing = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    fixtureCampaign: {
      id: fixtureCampaign.id,
      workflowId: fixtureCampaign.workflow_id,
      workflowVersion: fixtureCampaign.workflow_version,
      counters: fixtureCampaign.counters,
      videosCount: Array.isArray(fixtureCampaign.videos) ? fixtureCampaign.videos.length : 0,
    },
    files: {
      detailFile: DETAIL_FILE,
    },
    lineHints: {
      getVideosInvoke: lineOf(detailSource, "window.api.invoke('campaign:get-videos'"),
      getLogsInvoke: lineOf(detailSource, "window.api.invoke('campaign:get-logs'"),
      emptyStateText: lineOf(detailSource, 'No videos yet. Run the campaign to start.'),
      scannedCounter: lineOf(detailSource, "{ label: 'Scanned', value: state.scannedCount"),
    },
  }

  if (missing.length > 0) {
    return fail('Campaign detail UI snapshot contract is missing required markers', {
      errors: [`Missing markers/checks: ${missing.join(', ')}`],
      artifacts: {
        detailFile: DETAIL_FILE,
      },
      result,
    })
  }

  return ok('Campaign detail UI snapshot contract looks healthy (empty state + counters + DB fetch path)', {
    messages: [
      'Detail view includes DB-backed rebuild path (campaign:get-videos + campaign:get-logs)',
      'Empty-state and key counters (Scanned/Queued/Published/Failed) are present for baseline UI snapshot checks',
    ],
    artifacts: {
      detailFile: DETAIL_FILE,
    },
    result,
    checks: {
      ui: [
        'Detail view exposes empty-state baseline and counter widgets for visual regression checks',
      ],
      logs: [
        'Runner emits static contract results with source line hints for quick investigation',
      ],
    },
  })
}



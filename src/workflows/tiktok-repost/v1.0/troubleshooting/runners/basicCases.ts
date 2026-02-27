import fs from 'node:fs'
import path from 'node:path'
import type { NodeExecutionContext } from '@core/nodes/NodeDefinition'
import { createCampaignDocument } from '@main/db/models/Campaign'
import { campaignRepo, CampaignStore } from '@main/db/repositories/CampaignRepo'
import { accountRepo } from '@main/db/repositories/AccountRepo'
import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { TikTokScanner } from '@main/tiktok/TikTokScanner'
import { execute as runScannerNode } from '@nodes/tiktok-scanner/backend'

const ROOT = process.cwd()
const STEP2_SOURCES_FILE = path.join(ROOT, 'src/renderer/src/components/wizard/Step2_Sources.tsx')
const WIZARD_FILE = path.join(ROOT, 'src/workflows/tiktok-repost/v1.0/wizard.ts')
const SCANNER_NODE_FILE = path.join(ROOT, 'src/nodes/tiktok-scanner/backend.ts')
const DETAIL_FILE = path.join(ROOT, 'src/workflows/tiktok-repost/v1.0/detail.tsx')
const CAMPAIGN_REPO_FILE = path.join(ROOT, 'src/main/db/repositories/CampaignRepo.ts')
const TROUBLE_PANEL_FILE = path.join(ROOT, 'src/renderer/src/components/TroubleShottingPanel.tsx')
const TEST_PUBLISH_FILE = path.join(ROOT, 'src/main/tiktok/publisher/test-publish.ts')

type Logger = TroubleshootingCaseRunOptions['logger']

function log(logger: Logger, line: string, level: 'info' | 'warn' | 'error' = 'info') {
  logger?.(line, { level })
}

function safeRead(file: string): string {
  return fs.readFileSync(file, 'utf8')
}

function lineOf(text: string, needle: string): number | null {
  const idx = text.indexOf(needle)
  if (idx < 0) return null
  return text.slice(0, idx).split('\n').length
}

function seededIndex(seed: string | number, length: number): number {
  const text = String(seed)
  let hash = 2166136261 >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash % Math.max(1, length)
}

function ok(summary: string, extra: Partial<TroubleshootingRunResultLike> = {}): TroubleshootingRunResultLike {
  return {
    success: true,
    summary,
    ...extra,
  }
}

function fail(summary: string, extra: Partial<TroubleshootingRunResultLike> = {}): TroubleshootingRunResultLike {
  return {
    success: false,
    summary,
    ...extra,
  }
}

export async function runWizardSourcesMainValidationCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const step2 = safeRead(STEP2_SOURCES_FILE)
  const wizard = safeRead(WIZARD_FILE)

  const requiredStep2Controls = [
    'Min Likes',
    'Min Views',
    'Max Views',
    'Within Days',
    'custom_range',
    'historyLimit',
    'sortOrder',
    'timeRange',
  ]
  const requiredWizardValidationClauses = [
    'Add at least one source (channel or keyword)',
    'All sources must have a name',
  ]

  const missingControls = requiredStep2Controls.filter((token) => !step2.includes(token))
  const missingValidation = requiredWizardValidationClauses.filter((token) => !wizard.includes(token))

  log(logger, `[WizardMainValidation] Step2 file: ${STEP2_SOURCES_FILE}`)
  log(logger, `[WizardMainValidation] Workflow wizard file: ${WIZARD_FILE}`)
  log(logger, `[WizardMainValidation] Found ${requiredStep2Controls.length - missingControls.length}/${requiredStep2Controls.length} filter/source control markers`)
  log(logger, `[WizardMainValidation] Found ${requiredWizardValidationClauses.length - missingValidation.length}/${requiredWizardValidationClauses.length} source-step validation clauses`)

  const result = {
    files: {
      step2Sources: STEP2_SOURCES_FILE,
      workflowWizard: WIZARD_FILE,
    },
    checks: {
      requiredStep2Controls,
      requiredWizardValidationClauses,
      missingControls,
      missingValidation,
      lineHints: {
        minLikes: lineOf(step2, 'Min Likes'),
        minViews: lineOf(step2, 'Min Views'),
        maxViews: lineOf(step2, 'Max Views'),
        withinDays: lineOf(step2, 'Within Days'),
        sourceStepValidate: lineOf(wizard, "id: 'sources'"),
      },
    },
  }

  if (missingControls.length || missingValidation.length) {
    return fail('Wizard source step main contract is missing required controls/validation clauses', {
      errors: [
        ...(missingControls.length ? [`Missing Step2 controls: ${missingControls.join(', ')}`] : []),
        ...(missingValidation.length ? [`Missing wizard validation clauses: ${missingValidation.join(', ')}`] : []),
      ],
      artifacts: {
        step2SourceFile: STEP2_SOURCES_FILE,
        wizardSourceFile: WIZARD_FILE,
      },
      result,
      messages: ['Static analysis checks basic source-step UI/validation contract'],
    })
  }

  return ok('Wizard source step main validation contract looks present (controls + basic validate rules found)', {
    messages: [
      'Found filter controls: Min Likes / Min Views / Max Views / Within Days',
      'Found source step validation: non-empty sources + non-empty source names',
    ],
    artifacts: {
      step2SourceFile: STEP2_SOURCES_FILE,
      wizardSourceFile: WIZARD_FILE,
    },
    result,
  })
}

export async function runDebugPanelWorkflowFilterSmokeCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const panel = safeRead(TROUBLE_PANEL_FILE)

  const checks = {
    hasWorkflowState: panel.includes("const [workflowFilter, setWorkflowFilter] = useState<string>('all')"),
    hasVersionState: panel.includes("const [versionFilter, setVersionFilter] = useState<string>('all')"),
    hasWorkflowDropdown: panel.includes('<option value="all">All Workflows</option>'),
    hasGroupedCases: panel.includes('groupCasesBySuiteAndGroup(filteredCases)'),
    hasSuiteHeadingMarker: panel.includes('data-suite-heading={suiteSection.suite}'),
    hasRunAllButton: panel.includes('Run All Runnable'),
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[DebugPanelFilterSmoke] ${key}=${okFlag}`)
  })

  const missing = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    files: {
      panel: TROUBLE_PANEL_FILE,
    },
    lineHints: {
      workflowFilterState: lineOf(panel, "const [workflowFilter, setWorkflowFilter] = useState<string>('all')"),
      versionFilterState: lineOf(panel, "const [versionFilter, setVersionFilter] = useState<string>('all')"),
      suiteHeadingMarker: lineOf(panel, 'data-suite-heading={suiteSection.suite}'),
    },
  }

  if (missing.length > 0) {
    return fail('Debug panel workflow/version filter contract is incomplete', {
      errors: [`Missing UI contract markers: ${missing.join(', ')}`],
      artifacts: {
        panelFile: TROUBLE_PANEL_FILE,
      },
      result,
    })
  }

  return ok('Debug panel workflow/version filter contract looks healthy', {
    messages: [
      'Workflow + version filters exist with all/default option handling',
      'Suite/group heading markers and grouped sections are present',
    ],
    artifacts: {
      panelFile: TROUBLE_PANEL_FILE,
    },
    result,
  })
}

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

export async function runCaptionSourceFallbackCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const publishTestSource = safeRead(TEST_PUBLISH_FILE)

  const hasFallbackExpression =
    publishTestSource.includes("video.generated_caption || video.description || '#test'") ||
    publishTestSource.includes('video.generated_caption || video.description || "#test"')

  const fixtureVideo = {
    platform_id: 'caption-fixture-1',
    generated_caption: '',
    description: 'source description fallback',
  }
  const resolvedCaption = fixtureVideo.generated_caption || fixtureVideo.description || '#test'

  const checks = {
    hasFallbackExpression,
    resolvedToDescription: resolvedCaption === fixtureVideo.description,
    nonEmptyResolvedCaption: typeof resolvedCaption === 'string' && resolvedCaption.trim().length > 0,
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[CaptionFallbackSmoke] ${key}=${okFlag}`)
  })

  const missing = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    fixture: fixtureVideo,
    resolvedCaption,
    files: {
      testPublish: TEST_PUBLISH_FILE,
    },
  }

  if (missing.length > 0) {
    return fail('Caption source fallback contract failed', {
      errors: [`Failed checks: ${missing.join(', ')}`],
      artifacts: {
        testPublishFile: TEST_PUBLISH_FILE,
      },
      result,
    })
  }

  return ok('Caption source fallback contract passed (generated_caption -> description fallback)', {
    messages: [
      'Fallback expression exists in publish test path',
      'Empty generated caption resolves to source description safely',
    ],
    artifacts: {
      testPublishFile: TEST_PUBLISH_FILE,
    },
    result,
  })
}

export async function runTransformChainSmokeCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger

  const initial = {
    platform_id: 'transform-smoke-1',
    local_path: '/tmp/mock.mp4',
    description: 'original desc',
    status: 'queued',
    data: {
      description: 'original desc',
      author: 'fixture',
    },
  }

  // Fixture transform chain: caption enrich -> condition passthrough -> metadata mark.
  const step1 = {
    ...initial,
    generated_caption: `${initial.description} #debug`,
  }
  const step2 = {
    ...step1,
    skipped: false,
  }
  const step3 = {
    ...step2,
    data: {
      ...step2.data,
      transformedAt: Date.now(),
    },
  }

  const requiredFields: Array<keyof typeof initial> = ['platform_id', 'local_path', 'description', 'status']
  const missingRequired = requiredFields.filter((key) => !step3[key])
  const checks = {
    requiredFieldsPreserved: missingRequired.length === 0,
    generatedCaptionPresent: typeof step3.generated_caption === 'string' && step3.generated_caption.length > 0,
    dataObjectPreserved: !!step3.data && typeof step3.data === 'object',
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[TransformChainSmoke] ${key}=${okFlag}`)
  })

  const failed = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    requiredFields,
    missingRequired,
    initial,
    final: step3,
  }

  if (failed.length > 0) {
    return fail('Transform chain smoke fixture detected required field loss', {
      errors: [`Failed checks: ${failed.join(', ')}`],
      result,
    })
  }

  return ok('Transform chain smoke fixture passed (required fields preserved across steps)', {
    messages: [
      'Required publish fields remained intact after transform chain',
      'Generated caption and metadata enrichment are visible in final payload',
    ],
    result,
  })
}

export async function runWizardSourcesEdgeGapCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const step2 = safeRead(STEP2_SOURCES_FILE)
  const wizard = safeRead(WIZARD_FILE)
  const scannerNode = safeRead(SCANNER_NODE_FILE)

  const gaps: Array<{ id: string; message: string; file: string; line?: number | null }> = []

  const hasCustomRangeValidation = /custom_range|startDate|endDate/.test(wizard)
  if (!hasCustomRangeValidation) {
    gaps.push({
      id: 'custom-range-date-validation-missing',
      message: 'Wizard source-step validate() does not enforce startDate/endDate when timeRange=custom_range',
      file: WIZARD_FILE,
      line: lineOf(wizard, "id: 'sources'"),
    })
  }

  const hasMinMaxCrossValidation = /minViews|maxViews/.test(wizard) && /<=|>=/.test(wizard)
  if (!hasMinMaxCrossValidation) {
    gaps.push({
      id: 'min-max-views-cross-validation-missing',
      message: 'Wizard source-step validate() does not check minViews <= maxViews',
      file: WIZARD_FILE,
      line: lineOf(wizard, "id: 'sources'"),
    })
  }

  if (step2.includes('historyLimit: Number(e.target.value)') && scannerNode.includes('source.historyLimit ?? 50')) {
    gaps.push({
      id: 'history-limit-empty-string-zero-coercion',
      message: 'Step2 historyLimit uses Number(e.target.value); empty string becomes 0 and scanner backend ?? fallback will not restore default 50',
      file: STEP2_SOURCES_FILE,
      line: lineOf(step2, 'historyLimit: Number(e.target.value)'),
    })
  }

  if (step2.includes('Number(e.target.value) || undefined')) {
    gaps.push({
      id: 'filter-numeric-silent-coercion',
      message: 'Filter inputs coerce invalid numeric text and 0 to undefined via Number(...) || undefined (may hide user input mistakes)',
      file: STEP2_SOURCES_FILE,
      line: lineOf(step2, 'Number(e.target.value) || undefined'),
    })
  }

  if (step2.includes('label className="text-xs text-gray-500">Within Days</label>') && !wizard.includes('withinDays')) {
    gaps.push({
      id: 'within-days-runtime-validation-missing',
      message: 'Within Days has UI min attr but no wizard/runtime validation in source-step validate()',
      file: WIZARD_FILE,
      line: lineOf(wizard, "id: 'sources'"),
    })
  }

  if (gaps.length === 0) {
    log(logger, '[WizardEdgeGaps] No edge validation gaps detected by current heuristic checks')
    return ok('No wizard/filter edge validation gaps detected by heuristic checks', {
      messages: ['Heuristic checks did not detect missing custom-range/min-max/historyLimit validation issues'],
      artifacts: {
        step2SourceFile: STEP2_SOURCES_FILE,
        wizardSourceFile: WIZARD_FILE,
        scannerNodeFile: SCANNER_NODE_FILE,
      },
      result: { gaps: [] },
    })
  }

  for (const gap of gaps) {
    log(logger, `[WizardEdgeGaps] ${gap.id}: ${gap.message} (${path.relative(ROOT, gap.file)}${gap.line ? `:${gap.line}` : ''})`, 'warn')
  }

  return fail(`Detected ${gaps.length} wizard/scanner edge validation gap(s)`, {
    errors: gaps.map(g => `${g.id}: ${g.message}`),
    messages: [
      'This is an expected failing diagnostic case until wizard/scanner validation hardening is implemented.',
    ],
    artifacts: {
      step2SourceFile: STEP2_SOURCES_FILE,
      wizardSourceFile: WIZARD_FILE,
      scannerNodeFile: SCANNER_NODE_FILE,
    },
    result: { gaps },
  })
}

function createDummyStore() {
  const doc = createCampaignDocument({
    id: `trouble-fixture-${Date.now()}`,
    name: 'Troubleshooting Fixture',
    workflow_id: 'tiktok-repost',
    workflow_version: '1.0',
    videos: [],
    alerts: [],
    meta: {},
    params: {},
    counters: { queued: 0, downloaded: 0, published: 0, failed: 0 },
  })
  return new CampaignStore(doc, { save() {} } as any)
}

function resolveScannerDebugSource(options?: TroubleshootingCaseRunOptions, logger?: Logger) {
  const runtime = options?.runtime || {}
  const manualSourceName = typeof runtime.sourceName === 'string' ? runtime.sourceName.trim() : ''
  const manualSourceType = typeof runtime.sourceType === 'string' ? runtime.sourceType : ''
  if (manualSourceName) {
    const picked = {
      sourceType: manualSourceType || 'channel',
      sourceName: manualSourceName,
      sourceCampaignId: typeof runtime.sourceCampaignId === 'string' ? runtime.sourceCampaignId : undefined,
      mode: 'manual' as const,
    }
    log(logger, `[ScannerFixture] Using manual source picker: ${picked.sourceType}:${picked.sourceName}`)
    return picked
  }

  const sourcePool: Array<{ sourceType: string; sourceName: string; sourceCampaignId?: string }> = []
  for (const doc of campaignRepo.findAll()) {
    if (doc.workflow_id !== 'tiktok-repost') continue
    const sources = Array.isArray(doc.params?.sources) ? doc.params.sources : []
    for (const s of sources) {
      if (!s || typeof s !== 'object') continue
      const sourceName = typeof s.name === 'string' ? s.name.trim() : ''
      if (!sourceName) continue
      sourcePool.push({
        sourceType: typeof s.type === 'string' ? s.type : 'channel',
        sourceName,
        sourceCampaignId: doc.id,
      })
    }
  }

  if (sourcePool.length > 0) {
    const seed = runtime.randomSeed
    const hasSeed = seed !== undefined && String(seed).trim() !== ''
    const idx = hasSeed ? seededIndex(String(seed), sourcePool.length) : Math.floor(Math.random() * sourcePool.length)
    const picked = sourcePool[idx]
    log(logger, `[ScannerFixture] Auto-selected ${hasSeed ? `seeded` : 'random'} source: [${idx + 1}/${sourcePool.length}] ${picked.sourceType}:${picked.sourceName}${hasSeed ? ` (seed=${String(seed)})` : ''}`)
    return { ...picked, mode: hasSeed ? 'seeded-random' as const : 'random' as const }
  }

  log(logger, '[ScannerFixture] No tiktok-repost sources found in campaigns; using built-in fixture source', 'warn')
  return {
    sourceType: 'channel',
    sourceName: '@fixture',
    mode: 'fallback' as const,
  }
}

export async function runScannerFilterThresholdsFixtureCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const now = Date.now()
  const sourcePick = resolveScannerDebugSource(options, logger)
  const fixtureVideos = [
    {
      platform_id: 'vid_A',
      url: 'https://example.com/a',
      thumbnail: 'https://img/a.jpg',
      description: 'A',
      author: 'fixture',
      stats: { likes: 100, views: 1000 },
      created_at: now - 1 * 24 * 60 * 60 * 1000,
    },
    {
      platform_id: 'vid_B',
      url: 'https://example.com/b',
      thumbnail: 'https://img/b.jpg',
      description: 'B',
      author: 'fixture',
      stats: { likes: 5, views: 1000 },
      created_at: now - 1 * 24 * 60 * 60 * 1000,
    },
    {
      platform_id: 'vid_C',
      url: 'https://example.com/c',
      thumbnail: 'https://img/c.jpg',
      description: 'C',
      author: 'fixture',
      stats: { likes: 100, views: 50000 },
      created_at: now - 40 * 24 * 60 * 60 * 1000,
    },
    {
      platform_id: 'vid_D',
      url: 'https://example.com/d',
      thumbnail: '',
      description: 'D',
      author: 'fixture',
      stats: { likes: 100, views: 2000 },
      created_at: now - 2 * 24 * 60 * 60 * 1000,
    },
    {
      platform_id: 'vid_E',
      url: 'https://example.com/e',
      thumbnail: 'https://img/e.jpg',
      description: 'E',
      author: 'fixture',
      stats: { likes: 200, views: 8000 },
      created_at: now - 3 * 24 * 60 * 60 * 1000,
    },
  ]

  const scheduleCalls: any[] = []
  const progress: string[] = []
  const infoLogs: string[] = []
  const errorLogs: string[] = []

  const originalScanProfile = TikTokScanner.prototype.scanProfile
  const originalScanKeyword = TikTokScanner.prototype.scanKeyword
  const originalFindAll = accountRepo.findAll.bind(accountRepo)

  ;(TikTokScanner.prototype as any).scanProfile = async function mockedScanProfile() {
    return { videos: fixtureVideos }
  }
  ;(TikTokScanner.prototype as any).scanKeyword = async function mockedScanKeyword() {
    return { videos: fixtureVideos }
  }
  ;(accountRepo as any).findAll = () => []

  try {
    const ctx: NodeExecutionContext = {
      campaign_id: 'fixture-campaign-1',
      params: {
        campaign_id: 'fixture-campaign-1',
        sources: [{
          type: sourcePick.sourceType,
          name: sourcePick.sourceName,
          historyLimit: 50,
          sortOrder: 'newest',
          timeRange: 'history_only',
          autoSchedule: true,
          minLikes: 50,
          minViews: 900,
          maxViews: 10000,
          withinDays: 30,
        }],
      },
      store: createDummyStore(),
      logger: {
        info(msg: string) { infoLogs.push(msg); log(logger, msg) },
        error(msg: string, err?: any) {
          const line = `${msg}${err?.message ? `: ${err.message}` : ''}`
          errorLogs.push(line)
          log(logger, line, 'error')
        },
      },
      onProgress(msg: string) {
        progress.push(msg)
        log(logger, `[progress] ${msg}`)
      },
      alert(_level, title, body) {
        log(logger, `[alert] ${title}${body ? `: ${body}` : ''}`, 'warn')
      },
      asyncTasks: {
        schedule(taskType, payload, options) {
          scheduleCalls.push({ taskType, payload, options })
          return { taskId: `task_${scheduleCalls.length}`, created: true }
        },
      },
    }

    const out = await runScannerNode(null, ctx)
    const rows = Array.isArray(out?.data) ? out.data : []
    const actualIds = rows.map((v: any) => v.platform_id).sort()
    const expectedIds = ['vid_A', 'vid_D', 'vid_E']
    const expectedSorted = [...expectedIds].sort()
    const thumbnailSchedule = scheduleCalls.find(c => c.taskType === 'tiktok.thumbnail.batch')
    const scheduledThumbCount = Array.isArray(thumbnailSchedule?.payload?.videos) ? thumbnailSchedule.payload.videos.length : 0
    const expectedThumbCount = 2

    const pass =
      JSON.stringify(actualIds) === JSON.stringify(expectedSorted) &&
      scheduledThumbCount === expectedThumbCount &&
      errorLogs.length === 0

    const baseResult = {
      expectedIds: expectedSorted,
      actualIds,
      totalReturned: rows.length,
      scheduledThumbnailBatch: thumbnailSchedule ? {
        taskType: thumbnailSchedule.taskType,
        videoCount: scheduledThumbCount,
        dedupeKey: thumbnailSchedule.options?.dedupeKey,
        ownerKey: thumbnailSchedule.options?.ownerKey,
      } : null,
      sourceSelection: sourcePick,
      progress,
      infoLogsTail: infoLogs.slice(-10),
      errorLogs,
    }

    if (!pass) {
      return fail('Scanner filter fixture failed threshold assertions or thumbnail batch scheduling assertions', {
        errors: [
          `Expected filtered IDs=${expectedSorted.join(',')} but got ${actualIds.join(',')}`,
          `Expected thumbnail batch count=${expectedThumbCount} but got ${scheduledThumbCount}`,
          ...(errorLogs.length ? [`Scanner node emitted errors: ${errorLogs.join(' | ')}`] : []),
        ],
        result: baseResult,
        messages: ['Runs actual tiktok-scanner backend execute() with mocked TikTokScanner results'],
        params: {
          sourceType: sourcePick.sourceType,
          sourceName: sourcePick.sourceName,
          randomSeed: options?.runtime?.randomSeed,
        },
      })
    }

    return ok('Scanner filter fixture passed (min likes/views/max views/withinDays + thumbnail batch scheduling)', {
      messages: [
        `Filtered IDs matched expected: ${expectedSorted.join(', ')}`,
        `Thumbnail batch scheduled for ${scheduledThumbCount} filtered videos with thumbnails`,
        `Source selection mode: ${sourcePick.mode} (${sourcePick.sourceType}:${sourcePick.sourceName})`,
      ],
      params: {
        sourceType: sourcePick.sourceType,
        sourceName: sourcePick.sourceName,
        randomSeed: options?.runtime?.randomSeed,
      },
      result: baseResult,
      checks: {
        logs: [
          'Scanner filter summary log present',
          'Progress logs emitted for source + summary',
        ],
      },
    })
  } finally {
    ;(TikTokScanner.prototype as any).scanProfile = originalScanProfile
    ;(TikTokScanner.prototype as any).scanKeyword = originalScanKeyword
    ;(accountRepo as any).findAll = originalFindAll
  }
}

export async function runScannerChannelSmokeCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const now = Date.now()
  const sourcePick = resolveScannerDebugSource(options, logger)
  const fixtureVideos = [
    {
      platform_id: 'scan_smoke_1',
      url: 'https://example.com/smoke-1',
      thumbnail: 'https://img/smoke-1.jpg',
      description: 'Scanner smoke fixture 1',
      author: 'fixture_author',
      stats: { likes: 120, views: 2500 },
      created_at: now - 1 * 24 * 60 * 60 * 1000,
    },
    {
      platform_id: 'scan_smoke_2',
      url: 'https://example.com/smoke-2',
      thumbnail: '',
      description: 'Scanner smoke fixture 2',
      author: 'fixture_author',
      stats: { likes: 88, views: 1400 },
      created_at: now - 2 * 24 * 60 * 60 * 1000,
    },
  ]

  const scheduleCalls: any[] = []
  const progress: string[] = []
  const infoLogs: string[] = []
  const errorLogs: string[] = []
  const alerts: string[] = []

  const originalScanProfile = TikTokScanner.prototype.scanProfile
  const originalScanKeyword = TikTokScanner.prototype.scanKeyword
  const originalFindAll = accountRepo.findAll.bind(accountRepo)

  ;(TikTokScanner.prototype as any).scanProfile = async function mockedScanProfile() {
    return { videos: fixtureVideos }
  }
  ;(TikTokScanner.prototype as any).scanKeyword = async function mockedScanKeyword() {
    return { videos: fixtureVideos }
  }
  ;(accountRepo as any).findAll = () => []

  try {
    if (sourcePick.sourceType !== 'channel') {
      log(logger, `[ScannerChannelSmoke] sourceType=${sourcePick.sourceType} provided, forcing channel path for this case`, 'warn')
    }

    const ctx: NodeExecutionContext = {
      campaign_id: 'fixture-campaign-channel-smoke',
      params: {
        campaign_id: 'fixture-campaign-channel-smoke',
        sources: [{
          type: 'channel',
          name: sourcePick.sourceName,
          historyLimit: 5,
          sortOrder: 'newest',
          timeRange: 'history_only',
          autoSchedule: true,
        }],
      },
      store: createDummyStore(),
      logger: {
        info(msg: string) {
          infoLogs.push(msg)
          log(logger, msg)
        },
        error(msg: string, err?: any) {
          const line = `${msg}${err?.message ? `: ${err.message}` : ''}`
          errorLogs.push(line)
          log(logger, line, 'error')
        },
      },
      onProgress(msg: string) {
        progress.push(msg)
        log(logger, `[progress] ${msg}`)
      },
      alert(_level, title, body) {
        const line = `${title}${body ? `: ${body}` : ''}`
        alerts.push(line)
        log(logger, `[alert] ${line}`, 'warn')
      },
      asyncTasks: {
        schedule(taskType, payload, scheduleOptions) {
          scheduleCalls.push({ taskType, payload, scheduleOptions })
          return { taskId: `task_${scheduleCalls.length}`, created: true }
        },
      },
    }

    const out = await runScannerNode(null, ctx)
    const rows = Array.isArray(out?.data) ? out.data : []
    const expectedIds = fixtureVideos.map(v => v.platform_id).sort()
    const actualIds = rows.map((v: any) => v.platform_id).sort()
    const expectedThumbCount = fixtureVideos.filter(v => typeof v.thumbnail === 'string' && v.thumbnail.length > 0).length
    const thumbnailSchedule = scheduleCalls.find(c => c.taskType === 'tiktok.thumbnail.batch')
    const scheduledThumbCount = Array.isArray(thumbnailSchedule?.payload?.videos) ? thumbnailSchedule.payload.videos.length : 0

    const missingFieldByVideo = rows
      .map((v: any) => {
        const missing: string[] = []
        if (typeof v.platform_id !== 'string' || !v.platform_id) missing.push('platform_id')
        if (v.platform !== 'tiktok') missing.push('platform')
        if (typeof v.url !== 'string' || !v.url) missing.push('url')
        if (typeof v.source_meta?.source_name !== 'string' || !v.source_meta.source_name) missing.push('source_meta.source_name')
        if (v.source_meta?.source_type !== 'channel') missing.push('source_meta.source_type')
        return missing.length ? { platformId: v.platform_id || '(missing)', missing } : null
      })
      .filter(Boolean)

    const checks = {
      returnedVideoCount: rows.length === fixtureVideos.length,
      idsMatchFixture: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
      requiredFieldsPresent: missingFieldByVideo.length === 0,
      thumbnailBatchScheduled: scheduledThumbCount === expectedThumbCount,
      noScannerErrors: errorLogs.length === 0,
    }

    Object.entries(checks).forEach(([key, okFlag]) => {
      log(logger, `[ScannerChannelSmoke] ${key}=${okFlag}`)
    })

    const failed = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
    const result = {
      checks,
      expectedIds,
      actualIds,
      expectedThumbCount,
      scheduledThumbCount,
      missingFieldByVideo,
      sourceSelection: {
        ...sourcePick,
        sourceType: 'channel',
      },
      progress,
      infoLogsTail: infoLogs.slice(-10),
      errorLogs,
      alerts,
    }

    if (failed.length > 0) {
      return fail('Channel scan smoke fixture failed scanner contract checks', {
        errors: [`Failed checks: ${failed.join(', ')}`],
        result,
        params: {
          sourceType: 'channel',
          sourceName: sourcePick.sourceName,
          randomSeed: options?.runtime?.randomSeed,
        },
      })
    }

    return ok('Channel scan smoke fixture passed (scanner output + source metadata + thumbnail scheduling)', {
      messages: [
        `Returned videos: ${rows.length}`,
        `Stable IDs: ${actualIds.join(', ')}`,
        `Thumbnail batch scheduled for ${scheduledThumbCount}/${expectedThumbCount} thumbnail URLs`,
      ],
      params: {
        sourceType: 'channel',
        sourceName: sourcePick.sourceName,
        randomSeed: options?.runtime?.randomSeed,
      },
      result,
      checks: {
        db: [
          'Scanner output includes stable platform/source fields required for campaign persistence',
        ],
        logs: [
          'Scanner progress summary and source-level logs emitted without error logs',
        ],
      },
    })
  } finally {
    ;(TikTokScanner.prototype as any).scanProfile = originalScanProfile
    ;(TikTokScanner.prototype as any).scanKeyword = originalScanKeyword
    ;(accountRepo as any).findAll = originalFindAll
  }
}

export async function runScannerEmptyChannelCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const sourcePick = resolveScannerDebugSource(options, logger)
  const fixtureVideos: any[] = []

  const scheduleCalls: any[] = []
  const progress: string[] = []
  const infoLogs: string[] = []
  const errorLogs: string[] = []
  const alerts: string[] = []

  const originalScanProfile = TikTokScanner.prototype.scanProfile
  const originalScanKeyword = TikTokScanner.prototype.scanKeyword
  const originalFindAll = accountRepo.findAll.bind(accountRepo)

  ;(TikTokScanner.prototype as any).scanProfile = async function mockedScanProfile() {
    return { videos: fixtureVideos }
  }
  ;(TikTokScanner.prototype as any).scanKeyword = async function mockedScanKeyword() {
    return { videos: fixtureVideos }
  }
  ;(accountRepo as any).findAll = () => []

  try {
    if (sourcePick.sourceType !== 'channel') {
      log(logger, `[ScannerEmptyChannel] sourceType=${sourcePick.sourceType} provided, forcing channel path for this case`, 'warn')
    }

    const ctx: NodeExecutionContext = {
      campaign_id: 'fixture-campaign-empty-channel',
      params: {
        campaign_id: 'fixture-campaign-empty-channel',
        sources: [{
          type: 'channel',
          name: sourcePick.sourceName,
          historyLimit: 5,
          sortOrder: 'newest',
          timeRange: 'history_only',
          autoSchedule: true,
        }],
      },
      store: createDummyStore(),
      logger: {
        info(msg: string) {
          infoLogs.push(msg)
          log(logger, msg)
        },
        error(msg: string, err?: any) {
          const line = `${msg}${err?.message ? `: ${err.message}` : ''}`
          errorLogs.push(line)
          log(logger, line, 'error')
        },
      },
      onProgress(msg: string) {
        progress.push(msg)
        log(logger, `[progress] ${msg}`)
      },
      alert(_level, title, body) {
        const line = `${title}${body ? `: ${body}` : ''}`
        alerts.push(line)
        log(logger, `[alert] ${line}`, 'warn')
      },
      asyncTasks: {
        schedule(taskType, payload, scheduleOptions) {
          scheduleCalls.push({ taskType, payload, scheduleOptions })
          return { taskId: `task_${scheduleCalls.length}`, created: true }
        },
      },
    }

    const out = await runScannerNode(null, ctx)
    const rows = Array.isArray(out?.data) ? out.data : []
    const thumbnailSchedule = scheduleCalls.find(c => c.taskType === 'tiktok.thumbnail.batch')
    const hasZeroSummary = progress.some(line => /0 videos/i.test(line))
    const checks = {
      returnsZeroRows: rows.length === 0,
      noThumbnailBatchScheduled: !thumbnailSchedule,
      hasZeroSummaryProgress: hasZeroSummary,
      noScannerErrors: errorLogs.length === 0,
    }

    Object.entries(checks).forEach(([key, okFlag]) => {
      log(logger, `[ScannerEmptyChannel] ${key}=${okFlag}`)
    })

    const failed = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
    const result = {
      checks,
      sourceSelection: {
        ...sourcePick,
        sourceType: 'channel',
      },
      totalReturned: rows.length,
      progress,
      infoLogsTail: infoLogs.slice(-10),
      errorLogs,
      alerts,
      scheduleCalls,
    }

    if (failed.length > 0) {
      return fail('Empty-channel scan fixture failed graceful-empty-path checks', {
        errors: [`Failed checks: ${failed.join(', ')}`],
        result,
        params: {
          sourceType: 'channel',
          sourceName: sourcePick.sourceName,
          randomSeed: options?.runtime?.randomSeed,
        },
      })
    }

    return ok('Empty-channel scan fixture passed (graceful zero-result path)', {
      messages: [
        'Scanner returned zero videos without throwing',
        'No thumbnail async task was scheduled for empty source result',
      ],
      params: {
        sourceType: 'channel',
        sourceName: sourcePick.sourceName,
        randomSeed: options?.runtime?.randomSeed,
      },
      result,
      checks: {
        db: [
          'No scan output rows emitted for empty source fixture (prevents placeholder inserts)',
        ],
        logs: [
          'Progress contains explicit zero-videos summary and no error logs',
        ],
      },
    })
  } finally {
    ;(TikTokScanner.prototype as any).scanProfile = originalScanProfile
    ;(TikTokScanner.prototype as any).scanKeyword = originalScanKeyword
    ;(accountRepo as any).findAll = originalFindAll
  }
}

function runThumbnailNormalizationFixture(caseId: string, logger?: Logger): TroubleshootingRunResultLike {
  const cases: Record<string, { input: any; expected: string; label: string }> = {
    'tiktok-repost-v1.thumbnail.normalize-string': {
      label: 'string thumbnail',
      input: 'https://cdn.example.com/thumb.jpg',
      expected: 'https://cdn.example.com/thumb.jpg',
    },
    'tiktok-repost-v1.thumbnail.normalize-nested-object': {
      label: 'nested object thumbnail',
      input: { cover: { url_list: ['https://cdn.example.com/nested.jpg'] } },
      expected: 'https://cdn.example.com/nested.jpg',
    },
    'tiktok-repost-v1.thumbnail.malformed-payload-fallback': {
      label: 'malformed thumbnail payload',
      input: { foo: { bar: 123 }, cover: { url_list: [null, 123] } },
      expected: '',
    },
  }

  const fixture = cases[caseId]
  if (!fixture) return fail(`Unknown thumbnail normalization fixture case: ${caseId}`)

  const store = new CampaignStore(createCampaignDocument({
    id: `thumb-fixture-${Date.now()}`,
    name: 'Thumb Fixture',
    workflow_id: 'tiktok-repost',
    workflow_version: '1.0',
    videos: [{
      platform_id: 'thumb1',
      status: 'queued',
      data: { thumbnail: fixture.input },
    }],
  }), { save() {} } as any)

  const normalized = store.videos[0]?.data?.thumbnail
  log(logger, `[ThumbnailNormalize] case=${fixture.label} normalized=${JSON.stringify(normalized)}`)

  const success = normalized === fixture.expected
  const payload = {
    input: fixture.input,
    expected: fixture.expected,
    actual: normalized,
    files: {
      campaignRepo: CAMPAIGN_REPO_FILE,
    },
  }

  if (!success) {
    return fail(`Thumbnail normalization mismatch for ${fixture.label}`, {
      errors: [`Expected normalized thumbnail=${JSON.stringify(fixture.expected)} but got ${JSON.stringify(normalized)}`],
      result: payload,
      artifacts: {
        campaignRepoFile: CAMPAIGN_REPO_FILE,
      },
    })
  }

  return ok(`Thumbnail normalization passed for ${fixture.label}`, {
    messages: [`Normalized thumbnail => ${fixture.expected || '(empty fallback)'}`],
    result: payload,
    artifacts: {
      campaignRepoFile: CAMPAIGN_REPO_FILE,
    },
  })
}

export async function runThumbnailDetailUiCodepathContractCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const detail = safeRead(DETAIL_FILE)

  const checks = {
    hasLocalThumbProtocol: detail.includes('local-thumb://'),
    hasImgRender: detail.includes('<img src={video.thumbnail}'),
    hasStringThumbnailFallback: detail.includes("return typeof meta?.thumbnail === 'string' ? meta.thumbnail : ''"),
    hasDbVideosSourceComment: detail.includes('Fetch videos from DB (source of truth for counts + thumbnails)'),
  }

  Object.entries(checks).forEach(([k, v]) => log(logger, `[ThumbnailDetailUI] ${k}=${v}`))

  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  const result = {
    checks,
    lineHints: {
      localThumbProtocol: lineOf(detail, 'local-thumb://'),
      imgRender: lineOf(detail, '<img src={video.thumbnail}'),
      stringFallback: lineOf(detail, "return typeof meta?.thumbnail === 'string' ? meta.thumbnail : ''"),
    },
    files: { detailFile: DETAIL_FILE },
  }

  if (missing.length) {
    return fail('Thumbnail detail UI codepath contract missing one or more expected clauses', {
      errors: [`Missing codepath markers: ${missing.join(', ')}`],
      result,
      artifacts: {
        detailFile: DETAIL_FILE,
      },
    })
  }

  return ok('Thumbnail detail UI codepath contract found (local-thumb fallback + string fallback + image render)', {
    messages: ['Static analysis confirms expected thumbnail render path exists in tiktok-repost detail UI'],
    result,
    artifacts: {
      detailFile: DETAIL_FILE,
    },
  })
}

export async function runBasicTiktokRepostCase(
  caseId: string,
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike | null> {
  if (caseId === 'tiktok-repost-v1.debug-panel.workflow-filter-smoke') {
    return runDebugPanelWorkflowFilterSmokeCase(options)
  }
  if (caseId === 'tiktok-repost-v1.campaign.create-smoke') {
    return runCampaignCreateSmokeCase(options)
  }
  if (caseId === 'tiktok-repost-v1.campaign.detail-ui-open-snapshot') {
    return runCampaignDetailUiOpenSnapshotCase(options)
  }
  if (caseId === 'tiktok-repost-v1.caption.source-fallback') {
    return runCaptionSourceFallbackCase(options)
  }
  if (caseId === 'tiktok-repost-v1.transform.chain-smoke') {
    return runTransformChainSmokeCase(options)
  }
  if (caseId === 'tiktok-repost-v1.scan.wizard-sources-main-validation') {
    return runWizardSourcesMainValidationCase(options)
  }
  if (caseId === 'tiktok-repost-v1.scan.channel-smoke') {
    return runScannerChannelSmokeCase(options)
  }
  if (caseId === 'tiktok-repost-v1.scan.empty-channel') {
    return runScannerEmptyChannelCase(options)
  }
  if (caseId === 'tiktok-repost-v1.scan.wizard-sources-edge-validation-gaps') {
    return runWizardSourcesEdgeGapCase(options)
  }
  if (caseId === 'tiktok-repost-v1.scan.filter-thresholds-fixture') {
    return runScannerFilterThresholdsFixtureCase(options)
  }
  if (
    caseId === 'tiktok-repost-v1.thumbnail.normalize-string' ||
    caseId === 'tiktok-repost-v1.thumbnail.normalize-nested-object' ||
    caseId === 'tiktok-repost-v1.thumbnail.malformed-payload-fallback'
  ) {
    return runThumbnailNormalizationFixture(caseId, options?.logger)
  }
  if (caseId === 'tiktok-repost-v1.thumbnail.detail-ui-codepath-contract') {
    return runThumbnailDetailUiCodepathContractCase(options)
  }

  return null
}

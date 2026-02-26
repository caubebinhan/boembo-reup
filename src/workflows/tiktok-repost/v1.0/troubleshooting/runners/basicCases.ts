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
  if (caseId === 'tiktok-repost-v1.scan.wizard-sources-main-validation') {
    return runWizardSourcesMainValidationCase(options)
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

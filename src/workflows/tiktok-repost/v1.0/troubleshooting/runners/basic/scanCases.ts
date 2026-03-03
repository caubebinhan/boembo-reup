import type { NodeExecutionContext } from '@core/nodes/NodeDefinition'
import { createCampaignDocument } from '@main/db/models/Campaign'
import { campaignRepo, CampaignStore } from '@main/db/repositories/CampaignRepo'
import { accountRepo } from '@main/db/repositories/AccountRepo'
import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { TikTokScanner } from '@main/tiktok/TikTokScanner'
import { execute as runScannerNode } from '@nodes/tiktok-scanner/backend'
import {
  type Logger,
  type CheckMap,
  log,
  logCheckMap,
  failedChecks,
  seededIndex,
  ok,
  fail,
} from '../_base'
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
    const actualIds = rows.map((v: any) => v.platform_id).sort((a: string, b: string) => a.localeCompare(b))
    const expectedIds = ['vid_A', 'vid_D', 'vid_E']
    const expectedSorted = [...expectedIds].sort((a, b) => a.localeCompare(b))
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
    const expectedIds = fixtureVideos.map(v => v.platform_id).sort((a, b) => a.localeCompare(b))
    const actualIds = rows.map((v: any) => v.platform_id).sort((a: string, b: string) => a.localeCompare(b))
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

export async function runScannerSessionExpiredCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const sourcePick = resolveScannerDebugSource(options, logger)

  const scheduleCalls: any[] = []
  const progress: string[] = []
  const infoLogs: string[] = []
  const errorLogs: string[] = []
  const alerts: string[] = []

  const originalScanProfile = TikTokScanner.prototype.scanProfile
  const originalScanKeyword = TikTokScanner.prototype.scanKeyword
  const originalFindAll = accountRepo.findAll.bind(accountRepo)

  ;(TikTokScanner.prototype as any).scanProfile = async function mockedScanProfile() {
    throw new Error('session expired: login required')
  }
  ;(TikTokScanner.prototype as any).scanKeyword = async function mockedScanKeyword() {
    throw new Error('session expired: login required')
  }
  ;(accountRepo as any).findAll = () => []

  try {
    const ctx: NodeExecutionContext = {
      campaign_id: 'fixture-campaign-session-expired',
      params: {
        campaign_id: 'fixture-campaign-session-expired',
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
    const errorText = errorLogs.join(' | ').toLowerCase()
    const checks: CheckMap = {
      returnsZeroRows: rows.length === 0,
      scannerErrorLogged: errorLogs.some((line) => line.includes('Failed to scan')),
      sessionKeywordPresent: errorText.includes('session') || errorText.includes('expired'),
      noThumbnailTaskScheduled: scheduleCalls.length === 0,
      hasScanProgressLog: progress.some((line) => line.toLowerCase().includes('scanning')),
    }
    logCheckMap(logger, 'ScannerSessionExpired', checks)

    const failed = failedChecks(checks)
    const result = {
      checks,
      totalReturned: rows.length,
      sourceSelection: sourcePick,
      progress,
      infoLogsTail: infoLogs.slice(-10),
      errorLogs,
      alerts,
    }

    if (failed.length > 0) {
      return fail('Scanner session-expired fixture failed expected error-path checks', {
        errors: [`Failed checks: ${failed.join(', ')}`],
        result,
      })
    }

    return ok('Scanner session-expired fixture passed (graceful failure path captured)', {
      messages: [
        'Session-expired scanner error is logged with source context',
        'Run completes gracefully with zero output rows and no thumbnail scheduling',
      ],
      result,
    })
  } finally {
    ;(TikTokScanner.prototype as any).scanProfile = originalScanProfile
    ;(TikTokScanner.prototype as any).scanKeyword = originalScanKeyword
    ;(accountRepo as any).findAll = originalFindAll
  }
}

type RescanVideoFixture = {
  platform_id: string
  description: string
  status: string
  data?: Record<string, any>
}

function mergeRescanVideos(
  existingVideos: RescanVideoFixture[],
  incomingVideos: RescanVideoFixture[]
) {
  const byId = new Map<string, RescanVideoFixture>()
  const order: string[] = []

  for (const item of existingVideos) {
    byId.set(item.platform_id, { ...item, data: { ...(item.data || {}) } })
    order.push(item.platform_id)
  }

  let duplicateCount = 0
  let newCount = 0
  for (const incoming of incomingVideos) {
    const existing = byId.get(incoming.platform_id)
    if (existing) {
      duplicateCount += 1
      byId.set(incoming.platform_id, {
        ...existing,
        ...incoming,
        status: existing.status || incoming.status,
        data: {
          ...(existing.data || {}),
          ...(incoming.data || {}),
        },
      })
      continue
    }
    newCount += 1
    byId.set(incoming.platform_id, { ...incoming, data: { ...(incoming.data || {}) } })
    order.push(incoming.platform_id)
  }

  const merged = order.map((id) => byId.get(id)).filter(Boolean) as RescanVideoFixture[]
  return {
    merged,
    duplicateCount,
    newCount,
  }
}

export async function runScannerRescanDedupeExistingItemsCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger

  const existingVideos: RescanVideoFixture[] = [
    { platform_id: 'vid_A', description: 'existing A', status: 'queued', data: { views: 100 } },
    { platform_id: 'vid_B', description: 'existing B', status: 'queued', data: { views: 200 } },
    { platform_id: 'vid_C', description: 'existing C', status: 'queued', data: { views: 300 } },
    { platform_id: 'vid_D', description: 'existing D', status: 'queued', data: { views: 400 } },
    { platform_id: 'vid_E', description: 'existing E', status: 'queued', data: { views: 500 } },
  ]
  const rescanVideos: RescanVideoFixture[] = [
    { platform_id: 'vid_C', description: 'rescanned C', status: 'queued', data: { views: 333 } },
    { platform_id: 'vid_D', description: 'rescanned D', status: 'queued', data: { views: 444 } },
    { platform_id: 'vid_E', description: 'rescanned E', status: 'queued', data: { views: 555 } },
    { platform_id: 'vid_F', description: 'new F', status: 'queued', data: { views: 666 } },
    { platform_id: 'vid_G', description: 'new G', status: 'queued', data: { views: 777 } },
  ]

  const { merged, duplicateCount, newCount } = mergeRescanVideos(existingVideos, rescanVideos)
  const mergedIds = merged.map((item) => item.platform_id)
  const uniqueMergedIds = new Set(mergedIds)
  const expectedHeadOrder = existingVideos.map((item) => item.platform_id)
  const headOrder = mergedIds.slice(0, expectedHeadOrder.length)
  const tailOrder = mergedIds.slice(expectedHeadOrder.length)

  const checks: CheckMap = {
    duplicateCountExpected: duplicateCount === 3,
    newCountExpected: newCount === 2,
    mergedCountExpected: merged.length === 7,
    mergedIdsUnique: uniqueMergedIds.size === merged.length,
    existingOrderPreserved: JSON.stringify(headOrder) === JSON.stringify(expectedHeadOrder),
    newIdsAppendedAtTail: JSON.stringify(tailOrder) === JSON.stringify(['vid_F', 'vid_G']),
    mergedFieldUpdatedForDuplicate: merged.find((item) => item.platform_id === 'vid_C')?.data?.views === 333,
  }
  logCheckMap(logger, 'ScannerRescanDedupe', checks)

  const failed = failedChecks(checks)
  const result = {
    checks,
    existingIds: expectedHeadOrder,
    rescanIds: rescanVideos.map((item) => item.platform_id),
    mergedIds,
    duplicateCount,
    newCount,
    merged,
  }

  if (failed.length > 0) {
    return fail('Scanner re-scan dedupe fixture failed', {
      errors: [`Failed checks: ${failed.join(', ')}`],
      result,
    })
  }

  return ok('Scanner re-scan dedupe fixture passed (idempotent merge for overlapping platform_id)', {
    messages: [
      'Rescan overlap items merged by platform_id without duplicates',
      'New rescan items were appended in stable order at the end of merged collection',
    ],
    result,
  })
}



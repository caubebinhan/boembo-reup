import { existsSync, statSync } from 'node:fs'
import { campaignRepo } from '../db/repositories/CampaignRepo'
import { settingsRepo } from '../db/repositories/SettingsRepo'
import { SentryMain } from '../sentry'
import { findTroubleshootingCase, listTroubleshootingCases, runTroubleshootingCase } from './troubleshooting/cases'
import type {
  TroubleshootingArtifactManifestEntry,
  TroubleshootingCaseId,
  TroubleshootingCaseMeta,
  TroubleshootingDiagnosticFootprint,
  TroubleshootingLogLevel,
  TroubleshootingRunRecord,
  TroubleshootingRunResultLike,
  TroubleshootingSourceCandidate,
  TroubleshootingVideoCandidate,
} from './troubleshooting/types'

export type {
  TroubleshootingCaseDefinition,
  TroubleshootingCaseId,
  TroubleshootingRunRecord,
  TroubleshootingSourceCandidate,
  TroubleshootingVideoCandidate,
} from './troubleshooting/types'

interface RunHooks {
  onLog?: (runId: string, entry: TroubleshootingRunRecord['logs'][number]) => void
  onUpdate?: (record: TroubleshootingRunRecord) => void
  runtime?: { accountId?: string; [key: string]: any }
}

const RUNS_KEY = 'troubleshooting_runs_v1'
const MAX_RUNS = 50
const MAX_LOG_LINES_PER_RUN = 5000
const MAX_LINE_LENGTH = 1000
const FOOTPRINT_LOG_TAIL = 60
const FOOTPRINT_ERROR_TAIL = 20
const FOOTPRINT_PREVIEW_LEN = 400

function loadRuns(): TroubleshootingRunRecord[] {
  const data = settingsRepo.get<TroubleshootingRunRecord[]>(RUNS_KEY, [])
  return Array.isArray(data) ? data : []
}

function saveRuns(runs: TroubleshootingRunRecord[]) {
  try {
    settingsRepo.set(RUNS_KEY, runs.slice(0, MAX_RUNS))
  } catch (err) {
    console.error('[TroubleshootingService] Failed to persist runs', err)
  }
}

function sanitizeResult(result: TroubleshootingRunResultLike | undefined) {
  if (!result) return undefined
  const debugArtifacts = result.artifacts || result.result?.debugArtifacts
  const resultPayload = result.result && typeof result.result === 'object'
    ? { ...result.result }
    : result.result
  if (resultPayload && typeof resultPayload === 'object' && 'debugArtifacts' in resultPayload) {
    const payloadObj = resultPayload as any
    payloadObj.debugArtifacts = debugArtifacts ? {
      screenshot: debugArtifacts.screenshot,
      html: debugArtifacts.html,
      sessionLog: debugArtifacts.sessionLog,
      cookieInputSnapshot: debugArtifacts.cookieInputSnapshot,
      cookieSnapshot: debugArtifacts.cookieSnapshot,
      videoMetadata: debugArtifacts.videoMetadata,
      checkpoints: Array.isArray(debugArtifacts.checkpoints) ? debugArtifacts.checkpoints.length : 0,
    } : undefined
  }
  return {
    success: result.success,
    summary: result.summary,
    accountUsername: result.accountUsername,
    videoPath: result.videoPath,
    params: result.params,
    messages: result.messages,
    errors: result.errors,
    checks: result.checks,
    result: resultPayload,
    artifacts: debugArtifacts ? {
      screenshot: debugArtifacts.screenshot,
      html: debugArtifacts.html,
      sessionLog: debugArtifacts.sessionLog,
      cookieInputSnapshot: debugArtifacts.cookieInputSnapshot,
      cookieSnapshot: debugArtifacts.cookieSnapshot,
      videoMetadata: debugArtifacts.videoMetadata,
      checkpoints: Array.isArray(debugArtifacts.checkpoints) ? debugArtifacts.checkpoints.length : 0,
    } : undefined,
  }
}

function safePreview(value: any, maxLen = FOOTPRINT_PREVIEW_LEN): string | undefined {
  if (value === undefined) return undefined
  if (value === null) return 'null'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return undefined
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

function inferValueKind(value: any): TroubleshootingArtifactManifestEntry['valueKind'] {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t
  return 'object'
}

function maybeFileMeta(value: any): Partial<TroubleshootingArtifactManifestEntry> {
  if (typeof value !== 'string') return {}
  const looksLikePath = value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
  if (!looksLikePath) return {}
  const out: Partial<TroubleshootingArtifactManifestEntry> = { filePath: value }
  try {
    out.fileExists = existsSync(value)
    if (out.fileExists) {
      const st = statSync(value)
      if (st.isFile()) {
        out.fileSize = st.size
        out.fileMtimeMs = st.mtimeMs
      }
    }
  } catch {
    out.fileExists = false
  }
  return out
}

function buildArtifactManifest(
  caseMeta: TroubleshootingCaseMeta | undefined,
  sanitizedResult: any
): TroubleshootingArtifactManifestEntry[] {
  const planned = new Map((caseMeta?.artifacts || []).map(a => [a.key, a]))
  const actualArtifacts = sanitizedResult?.artifacts && typeof sanitizedResult.artifacts === 'object'
    ? sanitizedResult.artifacts
    : {}
  const keys = new Set<string>([
    ...Object.keys(actualArtifacts),
    ...(caseMeta?.artifacts || []).map(a => a.key),
  ])

  const entries: TroubleshootingArtifactManifestEntry[] = []
  for (const key of keys) {
    const spec = planned.get(key)
    const value = (actualArtifacts as any)[key]
    entries.push({
      key,
      type: spec?.type,
      when: spec?.when,
      required: spec?.required,
      description: spec?.description,
      valueKind: inferValueKind(value),
      preview: safePreview(value),
      ...maybeFileMeta(value),
    })
  }
  return entries
}

function buildDiagnosticFootprint(run: TroubleshootingRunRecord): TroubleshootingDiagnosticFootprint {
  const logs = Array.isArray(run.logs) ? run.logs : []
  const errorLogs = logs.filter(l => l.level === 'error')
  const warnLogs = logs.filter(l => l.level === 'warn')
  const resultObj = run.result && typeof run.result === 'object' ? run.result : undefined

  return {
    schemaVersion: 1,
    generatedAt: Date.now(),
    case: {
      id: run.caseId,
      title: run.title,
      workflowId: run.workflowId,
      workflowVersion: run.workflowVersion,
      category: run.category,
      group: run.group,
      level: run.level,
      tags: run.tags,
    },
    execution: {
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationMs: run.endedAt ? Math.max(0, run.endedAt - run.startedAt) : undefined,
      logStats: run.logStats,
      logLinesStored: logs.length,
    },
    summary: run.summary,
    result: resultObj ? {
      success: typeof resultObj.success === 'boolean' ? resultObj.success : undefined,
      summary: typeof resultObj.summary === 'string' ? resultObj.summary : run.summary,
      params: resultObj.params && typeof resultObj.params === 'object' ? resultObj.params : undefined,
      messages: Array.isArray(resultObj.messages) ? resultObj.messages.slice(0, 50) : undefined,
      errors: Array.isArray(resultObj.errors) ? resultObj.errors.slice(0, 50) : (
        typeof (resultObj as any).error === 'string' ? [(resultObj as any).error] : undefined
      ),
      checks: resultObj.checks && typeof resultObj.checks === 'object' ? resultObj.checks : undefined,
    } : undefined,
    expectations: run.caseMeta ? {
      checks: run.caseMeta.checks,
      artifacts: run.caseMeta.artifacts,
      passMessages: run.caseMeta.passMessages,
      errorMessages: run.caseMeta.errorMessages,
    } : undefined,
    signals: {
      firstError: errorLogs[0]?.line,
      lastError: errorLogs[errorLogs.length - 1]?.line,
      errorCount: errorLogs.length,
      warnCount: warnLogs.length,
      errorLogTail: errorLogs.slice(-FOOTPRINT_ERROR_TAIL).map(l => ({ ts: l.ts, line: l.line })),
      warnLogTail: warnLogs.slice(-FOOTPRINT_ERROR_TAIL).map(l => ({ ts: l.ts, line: l.line })),
      timelineTail: logs.slice(-FOOTPRINT_LOG_TAIL).map(l => ({ ts: l.ts, level: l.level, line: l.line })),
    },
    artifacts: buildArtifactManifest(run.caseMeta, resultObj),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  }
}

export class TroubleshootingService {
  private static running = new Set<string>()

  static listCases() {
    return listTroubleshootingCases()
  }

  static getRuns(limit = MAX_RUNS): TroubleshootingRunRecord[] {
    return loadRuns().slice(0, Math.max(1, Math.min(MAX_RUNS, limit)))
  }

  static listVideoCandidates(payload?: { workflowId?: string; limit?: number }): TroubleshootingVideoCandidate[] {
    const workflowId = payload?.workflowId
    const limit = Math.max(1, Math.min(200, payload?.limit || 50))
    const candidates: TroubleshootingVideoCandidate[] = []

    for (const doc of campaignRepo.findAll()) {
      if (workflowId && doc.workflow_id !== workflowId) continue
      const store = campaignRepo.tryOpen(doc.id)
      if (!store) continue
      for (const video of store.videos || []) {
        if (!video?.local_path || typeof video.local_path !== 'string') continue
        const meta = video.data && typeof video.data === 'object' ? video.data : {}
        candidates.push({
          id: `${doc.id}:${video.platform_id}`,
          workflowId: doc.workflow_id,
          workflowVersion: doc.workflow_version,
          campaignId: doc.id,
          campaignName: doc.name,
          platformId: video.platform_id,
          status: video.status,
          localPath: video.local_path,
          description: typeof meta.description === 'string' ? meta.description : '',
          author: typeof meta.author === 'string' ? meta.author : '',
          thumbnail: typeof meta.thumbnail === 'string' ? meta.thumbnail : '',
          createdAt: typeof meta.created_at === 'number' ? meta.created_at : undefined,
          campaignUpdatedAt: doc.updated_at,
        })
      }
    }

    return candidates
      .sort((a, b) => (b.createdAt || b.campaignUpdatedAt || 0) - (a.createdAt || a.campaignUpdatedAt || 0))
      .slice(0, limit)
  }

  static listSourceCandidates(payload?: { workflowId?: string; limit?: number }): TroubleshootingSourceCandidate[] {
    const workflowId = payload?.workflowId
    const limit = Math.max(1, Math.min(200, payload?.limit || 100))
    const out: TroubleshootingSourceCandidate[] = []

    for (const doc of campaignRepo.findAll()) {
      if (workflowId && doc.workflow_id !== workflowId) continue
      const sources = Array.isArray(doc.params?.sources) ? doc.params.sources : []
      for (let i = 0; i < sources.length; i += 1) {
        const s = sources[i]
        if (!s || typeof s !== 'object') continue
        const sourceType = typeof s.type === 'string' ? s.type : 'channel'
        const sourceName = typeof s.name === 'string' ? s.name.trim() : ''
        if (!sourceName) continue
        out.push({
          id: `${doc.id}:${i}:${sourceType}:${sourceName}`,
          workflowId: doc.workflow_id,
          workflowVersion: doc.workflow_version,
          campaignId: doc.id,
          campaignName: doc.name,
          sourceType,
          sourceName,
          historyLimit: typeof s.historyLimit === 'number' ? s.historyLimit : undefined,
          sortOrder: typeof s.sortOrder === 'string' ? s.sortOrder : undefined,
          timeRange: typeof s.timeRange === 'string' ? s.timeRange : undefined,
          minLikes: typeof s.minLikes === 'number' ? s.minLikes : undefined,
          minViews: typeof s.minViews === 'number' ? s.minViews : undefined,
          maxViews: typeof s.maxViews === 'number' ? s.maxViews : undefined,
          withinDays: typeof s.withinDays === 'number' ? s.withinDays : undefined,
          campaignUpdatedAt: doc.updated_at,
        })
      }
    }

    return out
      .sort((a, b) => (b.campaignUpdatedAt || 0) - (a.campaignUpdatedAt || 0))
      .slice(0, limit)
  }

  static getRunById(id: string): TroubleshootingRunRecord | null {
    if (!id) return null
    return loadRuns().find(r => r.id === id) || null
  }

  static clearRuns() {
    saveRuns([])
    return { success: true }
  }

  static sendRunToSentry(runId: string) {
    const run = this.getRunById(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)

    const errorLines = (run.logs || []).filter(l => l.level === 'error').slice(-20)
    const warnLines = (run.logs || []).filter(l => l.level === 'warn').slice(-20)
    const fullLog = run.logs || []

    SentryMain.withScope((scope) => {
      scope.setLevel(run.status === 'failed' ? 'error' : 'warning')
      if (run.workflowId) scope.setTag('troubleshooting.workflow_id', run.workflowId)
      if (run.workflowVersion) scope.setTag('troubleshooting.workflow_version', run.workflowVersion)
      scope.setTag('troubleshooting.case_id', run.caseId)
      if (run.group) scope.setTag('troubleshooting.group', run.group)
      if (run.category) scope.setTag('troubleshooting.category', run.category)
      if (run.level) scope.setTag('troubleshooting.level', run.level)
      scope.setTag('troubleshooting.status', run.status)
      scope.setContext('troubleshooting_run', {
        id: run.id,
        title: run.title,
        summary: run.summary,
        status: run.status,
        workflowId: run.workflowId,
        workflowVersion: run.workflowVersion,
        category: run.category,
        group: run.group,
        level: run.level,
        tags: run.tags,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        logStats: run.logStats,
        caseMeta: run.caseMeta,
        result: run.result,
      })
      if (run.diagnosticFootprint) {
        scope.setContext('troubleshooting_footprint', run.diagnosticFootprint as any)
      }
      scope.setExtra('error_lines', errorLines)
      scope.setExtra('warn_lines', warnLines)
      scope.setExtra('full_log', fullLog)
      scope.setFingerprint([
        'troubleshooting',
        run.workflowId || 'unknown-workflow',
        run.workflowVersion || 'unknown-version',
        run.caseId,
      ])
      SentryMain.captureMessage(`[Troubleshooting] ${run.status.toUpperCase()} ${run.caseId}: ${run.summary || run.title}`)
    })

    return { success: true }
  }

  static async runCase(caseId: TroubleshootingCaseId, hooks?: RunHooks): Promise<TroubleshootingRunRecord> {
    const def = findTroubleshootingCase(caseId)
    if (!def) throw new Error(`Unknown troubleshooting case: ${caseId}`)
    if (def.implemented === false) throw new Error(`Case not implemented yet: ${caseId}`)
    if (this.running.has(caseId)) throw new Error(`Case is already running: ${caseId}`)

    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record: TroubleshootingRunRecord = {
      id: runId,
      caseId,
      title: def.title,
      workflowId: def.workflowId,
      workflowVersion: def.workflowVersion,
      category: def.category,
      group: def.group,
      tags: def.tags,
      level: def.level,
      caseMeta: def.meta,
      logStats: { total: 0, info: 0, warn: 0, error: 0 },
      status: 'running',
      startedAt: Date.now(),
      logs: [],
    }

    this.running.add(caseId)
    this.upsertRun(record)
    hooks?.onUpdate?.(record)

    const pushLog = (line: string, level: TroubleshootingLogLevel = 'info') => {
      const entry = { ts: Date.now(), level, line: String(line || '').slice(0, MAX_LINE_LENGTH) }
      record.logs.push(entry)
      if (!record.logStats) record.logStats = { total: 0, info: 0, warn: 0, error: 0 }
      record.logStats.total += 1
      if (level === 'error') record.logStats.error += 1
      else if (level === 'warn') record.logStats.warn += 1
      else record.logStats.info += 1
      if (record.logs.length > MAX_LOG_LINES_PER_RUN) {
        record.logs = record.logs.slice(-MAX_LOG_LINES_PER_RUN)
      }
      this.upsertRun(record)
      hooks?.onLog?.(runId, entry)
    }

    try {
      const result = await runTroubleshootingCase(caseId, {
        logger: (line, meta) => pushLog(line, meta?.level || 'info'),
        runtime: hooks?.runtime,
      })
      if (!result) throw new Error(`No runner registered for case: ${caseId}`)

      record.status = result.success ? 'passed' : 'failed'
      record.endedAt = Date.now()
      record.summary = result.summary
      record.result = sanitizeResult(result)
      record.diagnosticFootprint = buildDiagnosticFootprint(record)
      this.upsertRun(record)
      hooks?.onUpdate?.(record)
      return record
    } catch (err: any) {
      const message = err?.message || String(err)
      pushLog(`Runner crashed: ${message}`, 'error')
      record.status = 'failed'
      record.endedAt = Date.now()
      record.summary = `Runner crashed: ${message}`
      record.result = { success: false, error: message }
      record.diagnosticFootprint = buildDiagnosticFootprint(record)
      this.upsertRun(record)
      hooks?.onUpdate?.(record)
      return record
    } finally {
      this.running.delete(caseId)
    }
  }

  private static upsertRun(run: TroubleshootingRunRecord) {
    const runs = loadRuns()
    const idx = runs.findIndex(r => r.id === run.id)
    if (idx >= 0) runs[idx] = run
    else runs.unshift(run)
    saveRuns(runs)
  }
}

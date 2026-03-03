import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { campaignRepo } from '../db/repositories/CampaignRepo'
import { settingsRepo } from '../db/repositories/SettingsRepo'
import { AppSettingsService } from './AppSettingsService'
import { sendSentryMessageToChannel, verifySentryEventIngestion } from './SentryStagingService'
import { CodedError } from '@core/errors/CodedError'
import {
  findTroubleshootingCase,
  listTroubleshootingCases,
  listTroubleshootingWorkflowSummaries,
  runTroubleshootingCase,
} from './troubleshooting/cases'
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
  TroubleshootingWorkflowSummary,
} from './troubleshooting/types'

export type {
  TroubleshootingCaseDefinition,
  TroubleshootingCaseId,
  TroubleshootingRunRecord,
  TroubleshootingSourceCandidate,
  TroubleshootingVideoCandidate,
  TroubleshootingWorkflowSummary,
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
const DEBUG_ROOT_DIR = resolve(process.cwd(), '.debug-runtime')
const DEBUG_ARTIFACT_DIR = resolve(DEBUG_ROOT_DIR, 'artifacts')
const DEBUG_FOOTPRINT_DIR = resolve(DEBUG_ROOT_DIR, 'footprints')
const WORKFLOW_FINGERPRINT_ALIAS: Record<string, string> = {
  main: 'MAIN',
  'tiktok-repost': 'TIKTOK',
  'upload-local': 'UPLOAD',
}

function detectRuntimeFlavor(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-apple-silicon'
  if (process.platform === 'darwin' && process.arch === 'x64') return 'macos-intel'
  return `${process.platform}-${process.arch}`
}

function toStableHash(value: string | Buffer): string {
  return createHash('sha1').update(value).digest('hex')
}

function toWorkflowFingerprintCode(workflowId?: string): string {
  const raw = String(workflowId || 'unscoped').trim().toLowerCase()
  if (WORKFLOW_FINGERPRINT_ALIAS[raw]) return WORKFLOW_FINGERPRINT_ALIAS[raw]
  const compact = raw
    .replaceAll(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .map(chunk => chunk.slice(0, 4))
    .join('')
    .toUpperCase()
  return compact || 'CASE'
}

function toReadableCaseFingerprintFallback(caseId: string, workflowId?: string): string {
  const workflowCode = toWorkflowFingerprintCode(workflowId)
  const idTail = String(caseId || '')
    .replaceAll(/[^a-zA-Z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .slice(-1)[0]
  const normalizedTail = (idTail || 'NA').slice(0, 6).toUpperCase()
  return `case-${workflowCode}-${normalizedTail}`
}

function toCaseSlug(value: string | undefined): string {
  const normalized = String(value || '').trim().replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
  return normalized || 'unknown'
}

function toRunFingerprint(caseFingerprint: string | undefined, runId: string, startedAt: number): string {
  const seed = `${caseFingerprint || 'case-missing'}|${runId}|${startedAt}`
  return `run-${toStableHash(seed).slice(0, 16)}`
}

function isAbsolutePathString(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
}

function ensureDebugDirs() {
  mkdirSync(DEBUG_ARTIFACT_DIR, { recursive: true })
  mkdirSync(DEBUG_FOOTPRINT_DIR, { recursive: true })
}

function imageExtFromMime(mime: string): string {
  if (mime.includes('png')) return '.png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  if (mime.includes('webp')) return '.webp'
  if (mime.includes('gif')) return '.gif'
  if (mime.includes('svg')) return '.svg'
  return '.img'
}

type ArchivedArtifactEntry = {
  key: string
  sourceType: 'path' | 'data-url' | 'json' | 'text'
  sourcePath?: string
  archivedPath: string
  size: number
  sha1: string
}

function archiveSingleArtifact(
  rawValue: unknown,
  key: string,
  safeKey: string,
  runDir: string,
): ArchivedArtifactEntry | null {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null

  // Case 1: absolute file path
  if (typeof rawValue === 'string' && isAbsolutePathString(rawValue) && existsSync(rawValue)) {
    const fileExt = extname(rawValue) || '.txt'
    const targetPath = resolve(runDir, `${safeKey}${fileExt}`)
    copyFileSync(rawValue, targetPath)
    const bytes = readFileSync(targetPath)
    return { key, sourceType: 'path', sourcePath: rawValue, archivedPath: targetPath, size: bytes.length, sha1: toStableHash(bytes) }
  }

  // Case 2: data URL image
  if (typeof rawValue === 'string' && rawValue.startsWith('data:image/')) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(rawValue)
    if (match) {
      const bytes = Buffer.from(match[2], 'base64')
      const targetPath = resolve(runDir, `${safeKey}${imageExtFromMime(match[1])}`)
      writeFileSync(targetPath, bytes)
      return { key, sourceType: 'data-url', archivedPath: targetPath, size: bytes.length, sha1: toStableHash(bytes) }
    }
  }

  // Case 3: JSON object
  if (typeof rawValue === 'object') {
    const targetPath = resolve(runDir, `${safeKey}.json`)
    const text = JSON.stringify(rawValue, null, 2)
    writeFileSync(targetPath, text, 'utf8')
    const bytes = Buffer.from(text, 'utf8')
    return { key, sourceType: 'json', archivedPath: targetPath, size: bytes.length, sha1: toStableHash(bytes) }
  }

  // Case 4: plain text
  const text = String(rawValue)
  const targetPath = resolve(runDir, `${safeKey}.txt`)
  writeFileSync(targetPath, text, 'utf8')
  const bytes = Buffer.from(text, 'utf8')
  return { key, sourceType: 'text', archivedPath: targetPath, size: bytes.length, sha1: toStableHash(bytes) }
}

function archiveRunArtifacts(record: TroubleshootingRunRecord) {
  const resultObj = record.result && typeof record.result === 'object' ? record.result : null
  const artifactObj = resultObj?.artifacts && typeof resultObj.artifacts === 'object'
    ? (resultObj.artifacts as Record<string, unknown>)
    : null
  if (!resultObj || !artifactObj || Object.keys(artifactObj).length === 0) return

  ensureDebugDirs()
  const runDir = resolve(DEBUG_ARTIFACT_DIR, toCaseSlug(record.caseId), toCaseSlug(record.id))
  mkdirSync(runDir, { recursive: true })

  const archivedArtifacts: Record<string, unknown> = { ...artifactObj }
  const entries: ArchivedArtifactEntry[] = []

  for (const [key, rawValue] of Object.entries(artifactObj)) {
    const entry = archiveSingleArtifact(rawValue, key, toCaseSlug(key), runDir)
    if (entry) {
      archivedArtifacts[key] = entry.archivedPath
      entries.push(entry)
    }
  }

  const manifestPath = resolve(runDir, 'artifact-manifest.json')
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: Date.now(),
    caseId: record.caseId,
    caseFingerprint: record.caseFingerprint,
    runId: record.id,
    runFingerprint: record.runFingerprint,
    entries,
  }, null, 2), 'utf8')

  record.artifactManifestPath = manifestPath
  resultObj.artifacts = archivedArtifacts
  resultObj.artifactBundle = {
    rootDir: runDir,
    manifestPath,
    entryCount: entries.length,
  }
}

function persistFootprint(record: TroubleshootingRunRecord) {
  if (!record.diagnosticFootprint) return
  ensureDebugDirs()
  const outputDir = resolve(DEBUG_FOOTPRINT_DIR, toCaseSlug(record.caseId))
  mkdirSync(outputDir, { recursive: true })
  const outputPath = resolve(outputDir, `${toCaseSlug(record.id)}.json`)
  writeFileSync(outputPath, JSON.stringify(record.diagnosticFootprint, null, 2), 'utf8')
  record.footprintPath = outputPath

  const resultObj = record.result && typeof record.result === 'object' ? record.result : null
  if (resultObj) {
    resultObj.footprintPath = outputPath
  }
}

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
      runFingerprint: run.runFingerprint,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationMs: run.endedAt ? Math.max(0, run.endedAt - run.startedAt) : undefined,
      logStats: run.logStats,
      logLinesStored: logs.length,
    },
    summary: run.summary,
    fingerprints: {
      case: run.caseFingerprint,
      run: run.runFingerprint,
    },
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
      runtimeFlavor: detectRuntimeFlavor(),
    },
  }
}

export class TroubleshootingService {
  private static running = new Set<string>()

  static listCases() {
    return listTroubleshootingCases()
  }

  static listWorkflows(): TroubleshootingWorkflowSummary[] {
    return listTroubleshootingWorkflowSummaries()
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

  static async sendRunToSentry(runId: string) {
    const run = this.getRunById(runId)
    /** @throws DG-720 — Run not found by ID */
    if (!run) throw new CodedError('DG-720', `Run not found: ${runId}`)

    const errorLines = (run.logs || []).filter(l => l.level === 'error').slice(-20)
    const warnLines = (run.logs || []).filter(l => l.level === 'warn').slice(-20)
    const fullLogTail = (run.logs || []).slice(-400)
    const correlationId = `${run.id}:${Date.now()}`

    const sentryEnv = AppSettingsService.getSentryRuntimeEnv(process.env)

    const sent = await sendSentryMessageToChannel({
      channel: 'staging',
      level: run.status === 'failed' ? 'error' : 'warning',
      message: `[Troubleshooting] ${run.status.toUpperCase()} ${run.caseId}: ${run.summary || run.title}`,
      logger: 'troubleshooting.debug',
      environment: 'staging-debug',
      tags: {
        'troubleshooting.workflow_id': run.workflowId || 'unknown-workflow',
        'troubleshooting.workflow_version': run.workflowVersion || 'unknown-version',
        'troubleshooting.case_id': run.caseId,
        'troubleshooting.case_fingerprint': run.caseFingerprint || 'none',
        'troubleshooting.run_id': run.id,
        'troubleshooting.run_fingerprint': run.runFingerprint || 'none',
        'troubleshooting.correlation_id': correlationId,
        'troubleshooting.group': run.group,
        'troubleshooting.category': run.category,
        'troubleshooting.level': run.level,
        'troubleshooting.status': run.status,
      },
      fingerprint: [
        'troubleshooting',
        run.caseFingerprint || run.caseId,
        run.workflowId || 'unknown-workflow',
        run.workflowVersion || 'unknown-version',
      ],
      contexts: {
        troubleshooting_run: {
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
          caseFingerprint: run.caseFingerprint,
          runFingerprint: run.runFingerprint,
          artifactManifestPath: run.artifactManifestPath,
          footprintPath: run.footprintPath,
          logStats: run.logStats,
          caseMeta: run.caseMeta,
          result: run.result,
          diagnosticFootprint: run.diagnosticFootprint,
        },
      },
      extra: {
        error_lines: errorLines,
        warn_lines: warnLines,
        full_log_tail: fullLogTail,
      },
    }, sentryEnv)
    const failDetail = sent.lastError ? ` (${sent.lastError})` : ''
    if (!sent.success || !sent.eventId) {
      /** @throws DG-721 — Sentry staging send returned failure */
      throw new CodedError('DG-721', `Sentry staging send failed: ${sent.message}${failDetail}`)
    }

    const sentry = await verifySentryEventIngestion(sent.eventId, { channel: 'staging', env: sentryEnv })
    const verifyDetail = sentry.issueSearchUrl ? ` (${sentry.issueSearchUrl})` : ''
    if (sentry.strictRequired && !sentry.verified) {
      /** @throws DG-722 — Sentry staging verification failed */
      throw new CodedError('DG-722', `Sentry staging verification failed: ${sentry.message}${verifyDetail}`)
    }

    return {
      success: true,
      runId: run.id,
      caseId: run.caseId,
      correlationId,
      eventId: sent.eventId,
      sentry: {
        ...sentry,
        submitMessage: sent.message,
      },
    }
  }

  static async runCase(caseId: TroubleshootingCaseId, hooks?: RunHooks): Promise<TroubleshootingRunRecord> {
    const def = findTroubleshootingCase(caseId)
    /** @throws DG-723 — Unknown troubleshooting case */
    if (!def) throw new CodedError('DG-723', `Unknown troubleshooting case: ${caseId}`)
    /** @throws DG-724 — Case exists but not yet implemented */
    if (def.implemented === false) throw new CodedError('DG-724', `Case not implemented yet: ${caseId}`)
    /** @throws DG-725 — Case is already running (concurrent guard) */
    if (this.running.has(caseId)) throw new CodedError('DG-725', `Case is already running: ${caseId}`)

    const startedAt = Date.now()
    const runId = `${startedAt}_${Math.random().toString(36).slice(2, 8)}`
    const caseFingerprint = def.fingerprint || toReadableCaseFingerprintFallback(def.id, def.workflowId)
    const runFingerprint = toRunFingerprint(caseFingerprint, runId, startedAt)
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
      caseFingerprint,
      runFingerprint,
      logStats: { total: 0, info: 0, warn: 0, error: 0 },
      status: 'running',
      startedAt,
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
      /** @throws DG-726 — No runner registered for case */
      if (!result) throw new CodedError('DG-726', `No runner registered for case: ${caseId}`)

      record.status = result.success ? 'passed' : 'failed'
      record.endedAt = Date.now()
      record.summary = result.summary
      record.result = sanitizeResult(result)
      archiveRunArtifacts(record)
      record.diagnosticFootprint = buildDiagnosticFootprint(record)
      persistFootprint(record)
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
      archiveRunArtifacts(record)
      record.diagnosticFootprint = buildDiagnosticFootprint(record)
      persistFootprint(record)
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

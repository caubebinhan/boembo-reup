import { settingsRepo } from '../db/repositories/SettingsRepo'
import { runFullPublishE2ETest, runPublishTest, TroubleshootingRunResult } from '../tiktok/publisher/test-publish'

export type TroubleshootingCaseId =
  | 'tiktok-studio-smoke'
  | 'tiktok-publish-e2e'

export interface TroubleshootingCaseDefinition {
  id: TroubleshootingCaseId
  title: string
  description: string
  risk: 'safe' | 'real_publish'
}

export interface TroubleshootingRunRecord {
  id: string
  caseId: TroubleshootingCaseId
  title: string
  status: 'running' | 'passed' | 'failed'
  startedAt: number
  endedAt?: number
  summary?: string
  logs: Array<{ ts: number; level: 'info' | 'warn' | 'error'; line: string }>
  result?: any
}

interface RunHooks {
  onLog?: (runId: string, entry: TroubleshootingRunRecord['logs'][number]) => void
  onUpdate?: (record: TroubleshootingRunRecord) => void
}

const RUNS_KEY = 'troubleshooting_runs_v1'
const MAX_RUNS = 50
const MAX_LOG_LINES_PER_RUN = 1000
const MAX_LINE_LENGTH = 1000

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

function sanitizeResult(result: TroubleshootingRunResult | undefined) {
  if (!result) return undefined
  const debugArtifacts = result.artifacts || result.result?.debugArtifacts
  return {
    success: result.success,
    summary: result.summary,
    accountUsername: result.accountUsername,
    videoPath: result.videoPath,
    result: result.result ? {
      success: result.result.success,
      videoUrl: result.result.videoUrl,
      isReviewing: result.result.isReviewing,
      publishStatus: result.result.publishStatus,
      error: result.result.error,
      errorType: result.result.errorType,
      warning: result.result.warning,
    } : undefined,
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

export class TroubleshootingService {
  private static running = new Set<string>()

  static listCases(): TroubleshootingCaseDefinition[] {
    return [
      {
        id: 'tiktok-studio-smoke',
        title: 'TikTok Studio Smoke',
        description: 'Open TikTok Studio upload page, scan selectors/buttons, detect captcha, dump page artifacts.',
        risk: 'safe',
      },
      {
        id: 'tiktok-publish-e2e',
        title: 'TikTok Publish E2E',
        description: 'Real publish test using latest account cookies + latest local video from DB.',
        risk: 'real_publish',
      },
    ]
  }

  static getRuns(limit = MAX_RUNS): TroubleshootingRunRecord[] {
    return loadRuns().slice(0, Math.max(1, Math.min(MAX_RUNS, limit)))
  }

  static clearRuns() {
    saveRuns([])
    return { success: true }
  }

  static async runCase(caseId: TroubleshootingCaseId, hooks?: RunHooks): Promise<TroubleshootingRunRecord> {
    const def = this.listCases().find(c => c.id === caseId)
    if (!def) throw new Error(`Unknown troubleshooting case: ${caseId}`)
    if (this.running.has(caseId)) throw new Error(`Case is already running: ${caseId}`)

    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record: TroubleshootingRunRecord = {
      id: runId, caseId, title: def.title,
      status: 'running', startedAt: Date.now(), logs: [],
    }
    this.running.add(caseId)
    this.upsertRun(record)
    hooks?.onUpdate?.(record)

    const pushLog = (line: string, level: 'info' | 'warn' | 'error' = 'info') => {
      const entry = { ts: Date.now(), level, line: String(line || '').slice(0, MAX_LINE_LENGTH) }
      record.logs.push(entry)
      if (record.logs.length > MAX_LOG_LINES_PER_RUN) {
        record.logs = record.logs.slice(-MAX_LOG_LINES_PER_RUN)
      }
      this.upsertRun(record)
      hooks?.onLog?.(runId, entry)
    }

    try {
      let result: TroubleshootingRunResult
      if (caseId === 'tiktok-studio-smoke') {
        result = await runPublishTest({ logger: (line, meta) => pushLog(line, meta?.level || 'info') })
      } else {
        result = await runFullPublishE2ETest({ logger: (line, meta) => pushLog(line, meta?.level || 'info') })
      }

      record.status = result.success ? 'passed' : 'failed'
      record.endedAt = Date.now()
      record.summary = result.summary
      record.result = sanitizeResult(result)
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

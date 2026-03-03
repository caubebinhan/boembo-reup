/**
 * useDebugState — Centralized state management for the Debug/Troubleshooting panel.
 * ─────────────────────────────────────────────────────────────────────────────────
 * Extracted from the original monolithic TroubleshootingPanel component.
 * Uses useReducer for complex state transitions and exposes typed actions.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  groupCasesBySuiteAndGroup,
  mapArtifactsForView,
} from '../TroubleshootingPanel.helpers'
import { SentryAutoReporter } from '@core/troubleshooting/SentryAutoReporter'
import type { SentryAutoResult, SentryAutoRunPayload } from '@core/troubleshooting/SentryAutoReporter'

// ── Re-export existing types for sub-components ──────

export type TroubleCaseRisk = 'safe' | 'real_publish'
export type TroubleCaseLevel = 'basic' | 'intermediate' | 'advanced'

export interface TroubleCase {
  id: string
  title: string
  description: string
  fingerprint?: string
  risk: TroubleCaseRisk
  errorCode?: string
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: TroubleCaseLevel
  implemented?: boolean
  meta?: any
}

export interface TroubleLogEntry {
  ts: number
  level: 'info' | 'warn' | 'error'
  line: string
}

export interface TroubleRun {
  id: string
  caseId: string
  title: string
  status: 'running' | 'passed' | 'failed'
  errorCode?: string
  startedAt: number
  endedAt?: number
  summary?: string
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: TroubleCaseLevel
  caseMeta?: any
  caseFingerprint?: string
  runFingerprint?: string
  artifactManifestPath?: string
  footprintPath?: string
  logStats?: { total: number; info: number; warn: number; error: number }
  logs: TroubleLogEntry[]
  result?: any
  failure?: any
  diagnosticFootprint?: any
}

export interface TroubleAccount {
  id: string
  username?: string
  handle?: string
  avatar?: string
  status?: string
}

export interface TroubleVideoCandidate {
  id: string
  workflowId?: string
  workflowVersion?: string
  campaignId: string
  campaignName?: string
  platformId: string
  status?: string
  localPath: string
  description?: string
  author?: string
  thumbnail?: string
  createdAt?: number
  campaignUpdatedAt?: number
}

export interface TroubleSourceCandidate {
  id: string
  workflowId?: string
  workflowVersion?: string
  campaignId: string
  campaignName?: string
  sourceType: string
  sourceName: string
  historyLimit?: number
  sortOrder?: string
  timeRange?: string
  minLikes?: number
  minViews?: number
  maxViews?: number
  withinDays?: number
  campaignUpdatedAt?: number
}

export interface TroubleSentryFeedback {
  eventId?: string | null
  eventUrl?: string
  eventApiUrl?: string
  issueSearchUrl?: string
  verified?: boolean
  verificationEnabled?: boolean
  strictRequired?: boolean
  message?: string
  lastError?: string
  attempts?: number
  elapsedMs?: number
}

export interface TroubleWorkflowSummary {
  workflowId: string
  workflowVersion: string
  totalCases: number
  runnableCases: number
  plannedCases: number
}

export interface RunAllProgress {
  active: boolean
  total: number
  done: number
  currentCaseId?: string
}

export interface RunAllSummary {
  total: number
  passed: number
  failed: number
  failedCaseCodes: string[]
  completedAt: number
}

export interface ExecutionOutcome {
  caseId: string
  title: string
  objective?: string
  status: 'passed' | 'failed'
  summary?: string
  passedMessages: string[]
  failReasons: string[]
  finishedAt: number
}

// ── Computed view types ──────────────────────────────

export interface WorkflowOption {
  workflowId: string
  versions: string[]
  totalCases: number
  runnableCases: number
  plannedCases: number
}

export interface HealthSummary {
  totalCases: number
  runnableCases: number
  totalRuns: number
  passedRuns: number
  failedRuns: number
  runningCount: number
  healthPercent: number
}

// ── Style constants ──────────────────────────────────

export const LEVEL_COLOR: Record<string, string> = {
  info: 'text-slate-600',
  warn: 'text-amber-700',
  error: 'text-rose-700',
}

export const STATUS_CHIP: Record<string, string> = {
  running: 'text-sky-700 bg-sky-50 border-sky-200',
  passed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  failed: 'text-rose-700 bg-rose-50 border-rose-200',
}

// ── Helpers ──────────────────────────────────────────

function toStringList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string')
  if (typeof value === 'string') return [value]
  return []
}

export function parseRunMessages(run: TroubleRun) {
  const resultPassed = toStringList((run.result as any)?.messages)
  const resultErrors = toStringList((run.result as any)?.errors)
  const casePassed = run.caseMeta?.passMessages || []
  const caseErrors = run.caseMeta?.errorMessages || []
  const passedMessages = resultPassed.length > 0 ? resultPassed : casePassed
  const failReasons = [
    ...resultErrors,
    ...run.logs
      .filter((entry) => entry.level === 'error')
      .slice(-3)
      .map((entry) => entry.line),
  ]
  return {
    passedMessages,
    failReasons: failReasons.length > 0 ? failReasons : (run.status === 'failed' ? caseErrors : []),
  }
}

// ── Main Hook ────────────────────────────────────────

export function useDebugState() {
  const api = (window as any).api

  // ── Core state ──────────────────────────────────
  const [cases, setCases] = useState<TroubleCase[]>([])
  const [runs, setRuns] = useState<TroubleRun[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('error')
  const [sentryFeedback, setSentryFeedback] = useState<TroubleSentryFeedback | null>(null)
  const [sendingSentry, setSendingSentry] = useState(false)

  // ── Filters ─────────────────────────────────────
  const [workflowFilter, setWorkflowFilter] = useState<string>('all')
  const [versionFilter, setVersionFilter] = useState<string>('all')
  const [fullLogOpen, setFullLogOpen] = useState(false)

  // ── Runtime pickers ─────────────────────────────
  const [accounts, setAccounts] = useState<TroubleAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('auto')
  const [videoCandidates, setVideoCandidates] = useState<TroubleVideoCandidate[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<string>('auto')
  const [sourceCandidates, setSourceCandidates] = useState<TroubleSourceCandidate[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('auto')
  const [manualPickersEnabled, setManualPickersEnabled] = useState(false)
  const [autoRandomSeed, setAutoRandomSeed] = useState<string>('')

  // ── Workflow state ──────────────────────────────
  const [workflows, setWorkflows] = useState<TroubleWorkflowSummary[]>([])
  const [runAllProgress, setRunAllProgress] = useState<RunAllProgress>({
    active: false,
    total: 0,
    done: 0,
  })
  const [runAllSummary, setRunAllSummary] = useState<RunAllSummary | null>(null)
  const [latestOutcome, setLatestOutcome] = useState<ExecutionOutcome | null>(null)
  const [autoSentryEnabled, setAutoSentryEnabled] = useState(true)
  const [lastAutoSentryResult, setLastAutoSentryResult] = useState<SentryAutoResult | null>(null)
  const workflowFilterRef = useRef<string>('all')

  // ── Sentry auto-reporter ────────────────────────
  const sentryReporterRef = useRef<SentryAutoReporter | null>(null)
  if (!sentryReporterRef.current) {
    sentryReporterRef.current = new SentryAutoReporter(
      async (payload: SentryAutoRunPayload) => {
        return api.invoke('troubleshooting:send-sentry', {
          runId: payload.runId,
          caseId: payload.caseId,
          title: payload.title,
          summary: payload.summary,
          logs: payload.logs,
          result: payload.result,
          errorCode: payload.errorCode,
        })
      },
      { enabled: true, maxEventsPerWindow: 5, windowMs: 60_000, dedupeWindowMs: 300_000 }
    )
  }

  // Sync opt-out toggle to reporter
  useEffect(() => {
    sentryReporterRef.current?.setEnabled(autoSentryEnabled)
  }, [autoSentryEnabled])

  // ── Computed: workflow options ───────────────────
  const workflowOptions = useMemo<WorkflowOption[]>(() => {
    const byWorkflow = new Map<string, {
      workflowId: string; versions: Set<string>; totalCases: number; runnableCases: number; plannedCases: number
    }>()

    const add = (wId?: string, wVer?: string, total = 0, runnable = 0, planned = 0) => {
      const id = wId || 'unscoped'
      const ver = wVer || 'unversioned'
      if (!byWorkflow.has(id)) byWorkflow.set(id, { workflowId: id, versions: new Set(), totalCases: 0, runnableCases: 0, plannedCases: 0 })
      const b = byWorkflow.get(id)!
      b.versions.add(ver)
      b.totalCases += total
      b.runnableCases += runnable
      b.plannedCases += planned
    }

    if (workflows.length > 0) {
      for (const w of workflows) add(w.workflowId, w.workflowVersion, w.totalCases, w.runnableCases, w.plannedCases)
    } else {
      for (const c of cases) { const r = c.implemented !== false ? 1 : 0; add(c.workflowId, c.workflowVersion, 1, r, r ? 0 : 1) }
    }

    return [...byWorkflow.values()]
      .map(e => ({ ...e, versions: [...e.versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }))
      .sort((a, b) => a.workflowId.localeCompare(b.workflowId))
  }, [cases, workflows])

  const existingWorkflowIds = useMemo(() => new Set(workflowOptions.map(w => w.workflowId)), [workflowOptions])

  const versionOptions = useMemo(() => {
    if (workflowFilter === 'all') {
      const versions = new Set<string>()
      for (const c of cases) if (c.workflowVersion) versions.add(c.workflowVersion)
      return [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }
    return workflowOptions.find(w => w.workflowId === workflowFilter)?.versions || []
  }, [cases, workflowFilter, workflowOptions])

  // ── Computed: filtered data ─────────────────────
  const filteredCases = useMemo(() => cases.filter(c => {
    if (workflowFilter !== 'all' && (c.workflowId || 'unscoped') !== workflowFilter) return false
    if (versionFilter !== 'all' && (c.workflowVersion || 'unversioned') !== versionFilter) return false
    return true
  }), [cases, workflowFilter, versionFilter])

  const groupedCases = useMemo(() => groupCasesBySuiteAndGroup(filteredCases), [filteredCases])

  const filteredRuns = useMemo(() => runs.filter(r => {
    const rwId = r.workflowId || 'unscoped'
    if (existingWorkflowIds.size > 0 && !existingWorkflowIds.has(rwId)) return false
    if (workflowFilter !== 'all' && rwId !== workflowFilter) return false
    if (versionFilter !== 'all' && (r.workflowVersion || 'unversioned') !== versionFilter) return false
    return true
  }), [runs, workflowFilter, versionFilter, existingWorkflowIds])

  const selectedRun = useMemo(() => filteredRuns.find(r => r.id === selectedRunId) || filteredRuns[0] || null, [filteredRuns, selectedRunId])
  const caseMap = useMemo(() => new Map(cases.map(e => [e.id, e])), [cases])
  const selectedCaseDef = useMemo(() => selectedRun ? caseMap.get(selectedRun.caseId) || null : null, [caseMap, selectedRun])

  const selectedRunOutcome = useMemo(() => {
    if (!selectedRun) return null
    const objective = String((selectedCaseDef?.meta as any)?.objective || '').trim() || undefined
    const extracted = parseRunMessages(selectedRun)
    return {
      objective,
      passedMessages: extracted.passedMessages,
      failReasons: extracted.failReasons,
      expectedPassMessages: selectedRun.caseMeta?.passMessages || [],
      expectedErrorMessages: selectedRun.caseMeta?.errorMessages || [],
    }
  }, [selectedCaseDef, selectedRun])

  const selectedRunErrorTail = useMemo(() => {
    if (!selectedRun?.logs) return []
    return selectedRun.logs.filter(e => e.level === 'error').slice(-4)
  }, [selectedRun])

  const selectedRunArtifacts = useMemo(() => mapArtifactsForView(selectedRun?.result?.artifacts, selectedRun?.caseMeta?.artifacts), [selectedRun])

  const selectedRunFootprintPreview = useMemo(() => {
    if (!selectedRun?.diagnosticFootprint) return ''
    const text = JSON.stringify(selectedRun.diagnosticFootprint, null, 2)
    return text.length > 2200 ? `${text.slice(0, 2200)}...` : text
  }, [selectedRun])

  const selectedVideoCandidate = useMemo(() => videoCandidates.find(v => v.id === selectedVideoId) || null, [videoCandidates, selectedVideoId])
  const selectedSourceCandidate = useMemo(() => sourceCandidates.find(s => s.id === selectedSourceId) || null, [sourceCandidates, selectedSourceId])

  const activeWorkflowScope = workflowFilter === 'all' ? '' : workflowFilter
  const manualPickersActive = manualPickersEnabled && !!activeWorkflowScope

  // ── Computed: health summary ────────────────────
  const healthSummary = useMemo<HealthSummary>(() => {
    const totalCases = filteredCases.length
    const runnableCases = filteredCases.filter(c => c.implemented !== false).length
    const totalRuns = filteredRuns.length
    const passedRuns = filteredRuns.filter(r => r.status === 'passed').length
    const failedRuns = filteredRuns.filter(r => r.status === 'failed').length
    const runningCount = filteredRuns.filter(r => r.status === 'running').length
    const healthPercent = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : -1
    return { totalCases, runnableCases, totalRuns, passedRuns, failedRuns, runningCount, healthPercent }
  }, [filteredCases, filteredRuns])

  // ── Effects: filter sync ────────────────────────
  useEffect(() => { workflowFilterRef.current = workflowFilter }, [workflowFilter])
  useEffect(() => { if (workflowFilter !== 'all' && !existingWorkflowIds.has(workflowFilter)) setWorkflowFilter('all') }, [existingWorkflowIds, workflowFilter])
  useEffect(() => { if (versionFilter !== 'all' && !versionOptions.includes(versionFilter)) setVersionFilter('all') }, [versionFilter, versionOptions])
  useEffect(() => { if (selectedAccountId !== 'auto' && !accounts.some(a => a.id === selectedAccountId)) setSelectedAccountId('auto') }, [accounts, selectedAccountId])
  useEffect(() => { if (selectedVideoId !== 'auto' && !videoCandidates.some(v => v.id === selectedVideoId)) setSelectedVideoId('auto') }, [videoCandidates, selectedVideoId])
  useEffect(() => { if (selectedSourceId !== 'auto' && !sourceCandidates.some(s => s.id === selectedSourceId)) setSelectedSourceId('auto') }, [sourceCandidates, selectedSourceId])

  // ── Actions ─────────────────────────────────────

  const loadWorkflowCandidates = useCallback(async (workflowId?: string) => {
    if (!workflowId) { setVideoCandidates([]); setSourceCandidates([]); return }
    try {
      const [videoList, sourceList] = await Promise.all([
        api.invoke('troubleshooting:list-video-candidates', { workflowId, limit: 100 }).catch(() => []),
        api.invoke('troubleshooting:list-source-candidates', { workflowId, limit: 100 }).catch(() => []),
      ])
      setVideoCandidates(Array.isArray(videoList) ? videoList : [])
      setSourceCandidates(Array.isArray(sourceList) ? sourceList : [])
    } catch (_err) { setVideoCandidates([]); setSourceCandidates([]) }
  }, [api])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [caseList, runList, accountList, workflowList] = await Promise.all([
        api.invoke('troubleshooting:list-cases'),
        api.invoke('troubleshooting:list-runs', { limit: 50 }),
        api.invoke('account:list').catch(() => []),
        api.invoke('troubleshooting:list-workflows').catch(() => []),
      ])
      setCases(Array.isArray(caseList) ? caseList : [])
      setRuns(Array.isArray(runList) ? runList : [])
      setAccounts(Array.isArray(accountList) ? accountList : [])
      setWorkflows(Array.isArray(workflowList) ? workflowList : [])
      setSelectedRunId((prev) => prev || (Array.isArray(runList) && runList[0]?.id) || null)
      await loadWorkflowCandidates(workflowFilterRef.current !== 'all' ? workflowFilterRef.current : undefined)
    } catch (err: any) {
      console.error('[TroubleshootingPanel] load failed', err)
      setMessageTone('error')
      setMessage(`Load failed: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [api, loadWorkflowCandidates])

  const runCase = useCallback(async (caseId: string): Promise<TroubleRun | null> => {
    if (busy[caseId]) return null
    const caseDef = caseMap.get(caseId)
    setBusy(prev => ({ ...prev, [caseId]: true }))
    setMessage('')
    setSentryFeedback(null)
    try {
      const runtime: Record<string, any> = {}
      if (selectedAccountId !== 'auto') runtime.accountId = selectedAccountId
      if (selectedVideoId !== 'auto') runtime.videoId = selectedVideoId
      if (selectedSourceId !== 'auto') {
        const src = sourceCandidates.find(s => s.id === selectedSourceId)
        if (src) { runtime.sourceName = src.sourceName; runtime.sourceType = src.sourceType; runtime.sourceCampaignId = src.campaignId }
      }
      if (autoRandomSeed.trim()) runtime.autoRandomSeed = autoRandomSeed.trim()
      const runtimePayload = Object.keys(runtime).length > 0 ? runtime : undefined
      const raw = await api.invoke('troubleshooting:run-case', { caseId, runtime: runtimePayload })
      const result = raw as TroubleRun | null
      if (result) {
        setRuns(prev => [result, ...prev])
        setSelectedRunId(result.id)
        const extracted = parseRunMessages(result)
        const outcomeStatus: 'passed' | 'failed' = result.status === 'passed' ? 'passed' : 'failed'
        const outcome: ExecutionOutcome = {
          caseId: result.caseId,
          title: result.title || caseDef?.title || caseId,
          objective: String((caseDef?.meta as any)?.objective || '').trim() || undefined,
          status: outcomeStatus,
          summary: result.summary,
          passedMessages: extracted.passedMessages,
          failReasons: extracted.failReasons,
          finishedAt: result.endedAt || Date.now(),
        }
        setLatestOutcome(outcome)

        // Auto-Sentry: report failed runs
        if (result.status === 'failed' && sentryReporterRef.current) {
          const autoResult = await sentryReporterRef.current.report({
            runId: result.id,
            caseId: result.caseId,
            title: result.title || caseDef?.title || caseId,
            status: result.status,
            errorCode: result.errorCode,
            summary: result.summary,
            logs: result.logs,
            result: result.result,
            failure: result.failure,
          })
          setLastAutoSentryResult(autoResult)
        }

        return result
      }
      return null
    } catch (err: any) {
      setMessageTone('error')
      setMessage(`Run [${caseId}] failed: ${err?.message || String(err)}`)
      return null
    } finally {
      setBusy(prev => ({ ...prev, [caseId]: false }))
    }
  }, [api, busy, caseMap, selectedAccountId, selectedVideoId, selectedSourceId, sourceCandidates, autoRandomSeed])

  const runAll = useCallback(async () => {
    const runnableCases = filteredCases.filter(c => c.implemented !== false)
    if (runnableCases.length === 0) return
    let passedCount = 0
    const failedCaseCodes: string[] = []

    setRunAllSummary(null)
    setRunAllProgress({ active: true, total: runnableCases.length, done: 0, currentCaseId: runnableCases[0]?.id })
    setMessageTone('info')
    setMessage(`Troubleshooting started: ${runnableCases.length} case(s).`)

    try {
      for (let i = 0; i < runnableCases.length; i++) {
        const nextCase = runnableCases[i]
        setRunAllProgress(prev => ({ ...prev, done: i, currentCaseId: nextCase.id }))
        // eslint-disable-next-line no-await-in-loop
        const run = await runCase(nextCase.id)
        const caseCode = run?.caseFingerprint || nextCase.fingerprint || nextCase.id
        if (run?.status === 'passed') passedCount += 1
        else failedCaseCodes.push(caseCode)
      }

      const failedCount = failedCaseCodes.length
      setRunAllSummary({
        total: runnableCases.length,
        passed: passedCount,
        failed: failedCount,
        failedCaseCodes,
        completedAt: Date.now(),
      })

      setMessageTone(failedCount > 0 ? 'error' : 'info')
      setMessage(
        failedCount > 0
          ? `Troubleshooting completed: passed ${passedCount}/${runnableCases.length}, failed ${failedCount}. Failed case(s): ${failedCaseCodes.join(', ')}`
          : `Troubleshooting completed: passed ${passedCount}/${runnableCases.length}, failed 0.`
      )
    } finally {
      setRunAllProgress(prev => ({ ...prev, active: false, done: runnableCases.length, currentCaseId: undefined }))
    }
  }, [filteredCases, runCase])

  const sendSelectedRunToSentry = useCallback(async () => {
    if (!selectedRun || sendingSentry) return
    setSendingSentry(true)
    setSentryFeedback(null)
    try {
      const result = await api.invoke('troubleshooting:send-sentry', {
        runId: selectedRun.id, caseId: selectedRun.caseId, title: selectedRun.title,
        summary: selectedRun.summary, logs: selectedRun.logs, result: selectedRun.result,
        errorCode: selectedRun.errorCode,
      })
      setSentryFeedback(result || null)
      setMessageTone(result?.eventId ? 'info' : 'error')
      setMessage(result?.message || (result?.eventId ? 'Sentry event sent' : 'Sentry did not return eventId'))
    } catch (err: any) {
      setMessageTone('error')
      setMessage(`Sentry send failed: ${err?.message || String(err)}`)
    } finally {
      setSendingSentry(false)
    }
  }, [api, selectedRun, sendingSentry])

  const clearRuns = useCallback(async () => {
    try {
      await api.invoke('troubleshooting:clear-runs')
      setRuns([])
      setSelectedRunId(null)
      setLatestOutcome(null)
      setRunAllSummary(null)
      setMessage('')
      setSentryFeedback(null)
    } catch (err: any) {
      setMessageTone('error')
      setMessage(`Clear failed: ${err?.message || String(err)}`)
    }
  }, [api])

  // ── Initial load ────────────────────────────────
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (workflowFilter === 'all') return
    loadWorkflowCandidates(workflowFilter)
  }, [workflowFilter, loadWorkflowCandidates])

  // ── IPC listener ────────────────────────────────
  useEffect(() => {
    const unsub = api.on?.('troubleshooting:run-progress', (_event: any, data: any) => {
      if (!data?.runId) return
      setRuns(prev => prev.map(r => r.id === data.runId ? { ...r, ...data.patch } : r))
    })
    return () => { unsub?.() }
  }, [api])

  return {
    // State
    cases, runs, loading, busy, selectedRunId, message, messageTone,
    sentryFeedback, workflowFilter, versionFilter, fullLogOpen, sendingSentry,
    accounts, selectedAccountId, videoCandidates, selectedVideoId,
    sourceCandidates, selectedSourceId, manualPickersEnabled, autoRandomSeed,
    workflows, runAllProgress, runAllSummary, latestOutcome,
    autoSentryEnabled, lastAutoSentryResult,
    // Computed
    workflowOptions, existingWorkflowIds, versionOptions,
    filteredCases, groupedCases, filteredRuns,
    selectedRun, caseMap, selectedCaseDef, selectedRunOutcome,
    selectedRunErrorTail, selectedRunArtifacts, selectedRunFootprintPreview,
    selectedVideoCandidate, selectedSourceCandidate,
    activeWorkflowScope, manualPickersActive, healthSummary,
    sentryReporterStats: sentryReporterRef.current?.getStats() ?? { recentCount: 0, windowMs: 60000, maxPerWindow: 5, dedupeCount: 0 },
    // Setters
    setSelectedRunId, setWorkflowFilter, setVersionFilter, setFullLogOpen,
    setSelectedAccountId, setSelectedVideoId, setSelectedSourceId,
    setManualPickersEnabled, setAutoRandomSeed, setAutoSentryEnabled,
    // Actions
    load, runCase, runAll, sendSelectedRunToSentry, clearRuns,
  }
}

export type DebugState = ReturnType<typeof useDebugState>

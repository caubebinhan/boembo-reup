import { useEffect, useMemo, useRef, useState } from 'react'
import {
  groupCasesBySuiteAndGroup,
  mapArtifactsForView,
  type TroubleArtifactType,
  type TroubleCaseLevel,
  type TroubleCaseRisk,
} from './troubleshootingPanel.helpers'

type TroubleCase = {
  id: string
  title: string
  description: string
  fingerprint?: string
  risk: TroubleCaseRisk
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: TroubleCaseLevel
  implemented?: boolean
  meta?: {
    parameters?: Array<{ key: string; value?: string | number | boolean; description?: string; required?: boolean }>
    checks?: { db?: string[]; ui?: string[]; logs?: string[]; events?: string[]; files?: string[] }
    artifacts?: Array<{
      key: string
      type: TroubleArtifactType
      description?: string
      when?: 'always' | 'on-fail' | 'on-warn' | 'on-captcha' | 'on-auth-redirect' | 'on-selector-drift' | 'on-under-review' | 'manual'
      required?: boolean
    }>
    passMessages?: string[]
    errorMessages?: string[]
    notes?: string[]
  }
}

type TroubleLogEntry = {
  ts: number
  level: 'info' | 'warn' | 'error'
  line: string
}

type TroubleRun = {
  id: string
  caseId: string
  title: string
  status: 'running' | 'passed' | 'failed'
  startedAt: number
  endedAt?: number
  summary?: string
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: TroubleCaseLevel
  caseMeta?: TroubleCase['meta']
  caseFingerprint?: string
  runFingerprint?: string
  artifactManifestPath?: string
  footprintPath?: string
  logStats?: { total: number; info: number; warn: number; error: number }
  logs: TroubleLogEntry[]
  result?: any
  diagnosticFootprint?: any
}

type TroubleAccount = {
  id: string
  username?: string
  handle?: string
  avatar?: string
  status?: string
}

type TroubleVideoCandidate = {
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

type TroubleSourceCandidate = {
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

type TroubleSentryFeedback = {
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

type TroubleWorkflowSummary = {
  workflowId: string
  workflowVersion: string
  totalCases: number
  runnableCases: number
  plannedCases: number
}

type RunAllProgress = {
  active: boolean
  total: number
  done: number
  currentCaseId?: string
}

type ExecutionOutcome = {
  caseId: string
  title: string
  objective?: string
  status: 'passed' | 'failed'
  summary?: string
  passedMessages: string[]
  failReasons: string[]
  finishedAt: number
}

const levelColor: Record<string, string> = {
  info: 'text-slate-600',
  warn: 'text-amber-700',
  error: 'text-rose-700',
}

const statusChip: Record<string, string> = {
  running: 'text-sky-700 bg-sky-50 border-sky-200',
  passed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  failed: 'text-rose-700 bg-rose-50 border-rose-200',
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function parseRunMessages(run: TroubleRun) {
  const resultObj = run.result && typeof run.result === 'object' ? run.result : null
  const payload = resultObj?.result && typeof resultObj.result === 'object'
    ? resultObj.result
    : null
  const passedMessages = [
    ...toStringList(resultObj?.messages),
    ...toStringList(payload?.messages),
  ]
  const failReasons = [
    ...toStringList(resultObj?.errors),
    ...toStringList(payload?.errors),
    ...(typeof payload?.error === 'string' ? [payload.error.trim()] : []),
    ...(typeof resultObj?.error === 'string' ? [resultObj.error.trim()] : []),
  ]
  return { passedMessages, failReasons }
}

export function TroubleShottingPanel() {
  const api = (window as any).api
  const [cases, setCases] = useState<TroubleCase[]>([])
  const [runs, setRuns] = useState<TroubleRun[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('error')
  const [sentryFeedback, setSentryFeedback] = useState<TroubleSentryFeedback | null>(null)
  const [workflowFilter, setWorkflowFilter] = useState<string>('all')
  const [versionFilter, setVersionFilter] = useState<string>('all')
  const [fullLogOpen, setFullLogOpen] = useState(false)
  const [sendingSentry, setSendingSentry] = useState(false)
  const [accounts, setAccounts] = useState<TroubleAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('auto')
  const [videoCandidates, setVideoCandidates] = useState<TroubleVideoCandidate[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<string>('auto')
  const [manualTiktokRepostPickersEnabled, setManualTiktokRepostPickersEnabled] = useState(false)
  const [sourceCandidates, setSourceCandidates] = useState<TroubleSourceCandidate[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('auto')
  const [autoRandomSeed, setAutoRandomSeed] = useState<string>('')
  const [workflows, setWorkflows] = useState<TroubleWorkflowSummary[]>([])
  const [runAllProgress, setRunAllProgress] = useState<RunAllProgress>({
    active: false,
    total: 0,
    done: 0,
  })
  const [latestOutcome, setLatestOutcome] = useState<ExecutionOutcome | null>(null)
  const workflowFilterRef = useRef<string>('all')

  const workflowOptions = useMemo(() => {
    const byWorkflow = new Map<
      string,
      {
        workflowId: string
        versions: Set<string>
        totalCases: number
        runnableCases: number
        plannedCases: number
      }
    >()

    const addWorkflowSummary = (
      workflowId: string | undefined,
      workflowVersion: string | undefined,
      totalCases: number,
      runnableCases: number,
      plannedCases: number
    ) => {
      const id = workflowId || 'unscoped'
      const version = workflowVersion || 'unversioned'
      if (!byWorkflow.has(id)) {
        byWorkflow.set(id, {
          workflowId: id,
          versions: new Set<string>(),
          totalCases: 0,
          runnableCases: 0,
          plannedCases: 0,
        })
      }
      const bucket = byWorkflow.get(id)!
      bucket.versions.add(version)
      bucket.totalCases += totalCases
      bucket.runnableCases += runnableCases
      bucket.plannedCases += plannedCases
    }

    if (workflows.length > 0) {
      for (const workflow of workflows) {
        addWorkflowSummary(
          workflow.workflowId,
          workflow.workflowVersion,
          workflow.totalCases,
          workflow.runnableCases,
          workflow.plannedCases
        )
      }
    } else {
      for (const c of cases) {
        const runnable = c.implemented === false ? 0 : 1
        addWorkflowSummary(c.workflowId, c.workflowVersion, 1, runnable, runnable ? 0 : 1)
      }
    }

    return [...byWorkflow.values()]
      .map((entry) => ({
        workflowId: entry.workflowId,
        versions: [...entry.versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        totalCases: entry.totalCases,
        runnableCases: entry.runnableCases,
        plannedCases: entry.plannedCases,
      }))
      .sort((a, b) => a.workflowId.localeCompare(b.workflowId))
  }, [cases, workflows])

  const existingWorkflowIds = useMemo(() => {
    return new Set(workflowOptions.map((w) => w.workflowId))
  }, [workflowOptions])

  const versionOptions = useMemo(() => {
    if (workflowFilter === 'all') {
      const versions = new Set<string>()
      for (const c of cases) if (c.workflowVersion) versions.add(c.workflowVersion)
      return [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }
    const workflow = workflowOptions.find(w => w.workflowId === workflowFilter)
    return workflow?.versions || []
  }, [cases, workflowFilter, workflowOptions])

  useEffect(() => {
    workflowFilterRef.current = workflowFilter
  }, [workflowFilter])

  useEffect(() => {
    if (workflowFilter === 'all') return
    if (!existingWorkflowIds.has(workflowFilter)) {
      setWorkflowFilter('all')
    }
  }, [existingWorkflowIds, workflowFilter])

  useEffect(() => {
    if (versionFilter === 'all') return
    if (!versionOptions.includes(versionFilter)) setVersionFilter('all')
  }, [versionFilter, versionOptions])

  useEffect(() => {
    if (selectedAccountId === 'auto') return
    if (!accounts.some(a => a.id === selectedAccountId)) {
      setSelectedAccountId('auto')
    }
  }, [accounts, selectedAccountId])

  useEffect(() => {
    if (selectedVideoId === 'auto') return
    if (!videoCandidates.some(v => v.id === selectedVideoId)) {
      setSelectedVideoId('auto')
    }
  }, [videoCandidates, selectedVideoId])

  useEffect(() => {
    if (selectedSourceId === 'auto') return
    if (!sourceCandidates.some(s => s.id === selectedSourceId)) {
      setSelectedSourceId('auto')
    }
  }, [sourceCandidates, selectedSourceId])

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (workflowFilter !== 'all' && (c.workflowId || 'unscoped') !== workflowFilter) return false
      if (versionFilter !== 'all' && (c.workflowVersion || 'unversioned') !== versionFilter) return false
      return true
    })
  }, [cases, workflowFilter, versionFilter])

  const groupedCases = useMemo(() => {
    return groupCasesBySuiteAndGroup(filteredCases)
  }, [filteredCases])

  const filteredRuns = useMemo(() => {
    return runs.filter(r => {
      const runWorkflowId = r.workflowId || 'unscoped'
      if (existingWorkflowIds.size > 0 && !existingWorkflowIds.has(runWorkflowId)) return false
      if (workflowFilter !== 'all' && (r.workflowId || 'unscoped') !== workflowFilter) return false
      if (versionFilter !== 'all' && (r.workflowVersion || 'unversioned') !== versionFilter) return false
      return true
    })
  }, [runs, workflowFilter, versionFilter, existingWorkflowIds])

  const selectedRun = useMemo(
    () => filteredRuns.find(r => r.id === selectedRunId) || filteredRuns[0] || null,
    [filteredRuns, selectedRunId]
  )

  const caseMap = useMemo(() => {
    return new Map(cases.map((entry) => [entry.id, entry]))
  }, [cases])

  const selectedCaseDef = useMemo(() => {
    if (!selectedRun) return null
    return caseMap.get(selectedRun.caseId) || null
  }, [caseMap, selectedRun])

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
    return selectedRun.logs.filter((entry) => entry.level === 'error').slice(-4)
  }, [selectedRun])

  const selectedRunArtifacts = useMemo(() => {
    return mapArtifactsForView(selectedRun?.result?.artifacts, selectedRun?.caseMeta?.artifacts)
  }, [selectedRun])

  const selectedRunFootprintPreview = useMemo(() => {
    if (!selectedRun?.diagnosticFootprint) return ''
    const text = JSON.stringify(selectedRun.diagnosticFootprint, null, 2)
    return text.length > 2200 ? `${text.slice(0, 2200)}...` : text
  }, [selectedRun])

  const selectedVideoCandidate = useMemo(
    () => videoCandidates.find(v => v.id === selectedVideoId) || null,
    [videoCandidates, selectedVideoId]
  )
  const selectedSourceCandidate = useMemo(
    () => sourceCandidates.find(s => s.id === selectedSourceId) || null,
    [sourceCandidates, selectedSourceId]
  )

  const activeWorkflowScope = workflowFilter === 'all' ? '' : workflowFilter
  const manualPickersEnabled = manualTiktokRepostPickersEnabled && !!activeWorkflowScope

  const loadWorkflowCandidates = async (workflowId?: string) => {
    if (!workflowId) {
      setVideoCandidates([])
      setSourceCandidates([])
      return
    }
    try {
      const [videoList, sourceList] = await Promise.all([
        api.invoke('troubleshooting:list-video-candidates', { workflowId, limit: 100 }).catch(() => []),
        api.invoke('troubleshooting:list-source-candidates', { workflowId, limit: 100 }).catch(() => []),
      ])
      setVideoCandidates(Array.isArray(videoList) ? videoList : [])
      setSourceCandidates(Array.isArray(sourceList) ? sourceList : [])
    } catch (err) {
      console.error('[TroubleShottingPanel] load workflow candidates failed', err)
      setVideoCandidates([])
      setSourceCandidates([])
    }
  }

  const load = async () => {
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
      setSelectedRunId((prev: string | null) => prev || (Array.isArray(runList) && runList[0]?.id) || null)
      await loadWorkflowCandidates(workflowFilterRef.current !== 'all' ? workflowFilterRef.current : undefined)
    } catch (err: any) {
      console.error('[TroubleShottingPanel] load failed', err)
      setMessageTone('error')
      setMessage(`Load failed: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkflowCandidates(activeWorkflowScope || undefined)
  }, [activeWorkflowScope])

  useEffect(() => {
    load()

    const offLog = api.on?.('troubleshooting:log', (payload: any) => {
      setRuns(prev => prev.map(run =>
        run.id === payload?.runId
          ? {
            ...run,
            logs: [...(run.logs || []), payload.entry].slice(-5000),
            logStats: (() => {
              const level = payload?.entry?.level as TroubleLogEntry['level'] | undefined
              const stats = run.logStats || { total: 0, info: 0, warn: 0, error: 0 }
              return {
                total: stats.total + 1,
                info: stats.info + (level === 'info' ? 1 : 0),
                warn: stats.warn + (level === 'warn' ? 1 : 0),
                error: stats.error + (level === 'error' ? 1 : 0),
              }
            })(),
          }
          : run
      ))
    })

    const offUpdate = api.on?.('troubleshooting:run-update', (payload: any) => {
      const next: TroubleRun | undefined = payload?.record
      if (!next?.id) return
      setRuns(prev => {
        const idx = prev.findIndex(r => r.id === next.id)
        if (idx === -1) return [next, ...prev]
        const copy = [...prev]
        copy[idx] = next
        return copy
      })
      setSelectedRunId(prev => prev || next.id)
      if (next.status !== 'running') {
        setBusy(prev => ({ ...prev, [next.caseId]: false }))
        const caseDef = caseMap.get(next.caseId)
        const extracted = parseRunMessages(next)
        const detail = next.status === 'passed'
          ? (extracted.passedMessages[0] || next.summary || '')
          : (extracted.failReasons[0] || next.summary || '')
        setMessageTone(next.status === 'passed' ? 'info' : 'error')
        setMessage(`${next.status === 'passed' ? 'Passed' : 'Failed'}: ${next.title}${detail ? ` - ${detail}` : ''}`)
        setLatestOutcome({
          caseId: next.caseId,
          title: next.title,
          objective: String((caseDef?.meta as any)?.objective || '').trim() || undefined,
          status: next.status,
          summary: next.summary,
          passedMessages: extracted.passedMessages,
          failReasons: extracted.failReasons,
          finishedAt: Date.now(),
        })
      }
    })
    const offAccountUpdated = api.on?.('account:updated', async () => {
      try {
        const accountList = await api.invoke('account:list')
        setAccounts(Array.isArray(accountList) ? accountList : [])
      } catch {}
    })
    const offTroubleRefreshVideos = api.on?.('troubleshooting:refresh-videos', async () => {
      try {
        const scopedWorkflowId = workflowFilterRef.current !== 'all' ? workflowFilterRef.current : undefined
        if (!scopedWorkflowId) {
          setVideoCandidates([])
          return
        }
        const videoList = await api.invoke('troubleshooting:list-video-candidates', { workflowId: scopedWorkflowId, limit: 100 })
        setVideoCandidates(Array.isArray(videoList) ? videoList : [])
      } catch {}
    })
    const offTroubleRefreshSources = api.on?.('troubleshooting:refresh-sources', async () => {
      try {
        const scopedWorkflowId = workflowFilterRef.current !== 'all' ? workflowFilterRef.current : undefined
        if (!scopedWorkflowId) {
          setSourceCandidates([])
          return
        }
        const sourceList = await api.invoke('troubleshooting:list-source-candidates', { workflowId: scopedWorkflowId, limit: 100 })
        setSourceCandidates(Array.isArray(sourceList) ? sourceList : [])
      } catch {}
    })

    return () => {
      if (typeof offLog === 'function') offLog()
      if (typeof offUpdate === 'function') offUpdate()
      if (typeof offAccountUpdated === 'function') offAccountUpdated()
      if (typeof offTroubleRefreshVideos === 'function') offTroubleRefreshVideos()
      if (typeof offTroubleRefreshSources === 'function') offTroubleRefreshSources()
    }
  }, [caseMap])

  const runCase = async (caseId: string) => {
    setBusy(prev => ({ ...prev, [caseId]: true }))
    const caseDef = caseMap.get(caseId)
    const caseObjective = String((caseDef?.meta as any)?.objective || '').trim()
    setMessageTone('info')
    setMessage(
      caseObjective
        ? `Running ${caseDef?.title || caseId}: ${caseObjective}`
        : `Running ${caseDef?.title || caseId}`
    )
    setSentryFeedback(null)
    try {
      const caseWorkflowId = caseDef?.workflowId || ''
      const caseMatchesPickerScope = !!activeWorkflowScope && caseWorkflowId === activeWorkflowScope
      const applyManualPickers = manualPickersEnabled && caseMatchesPickerScope
      const run = await api.invoke('troubleshooting:run-case', {
        caseId,
        runtime: {
          accountId: applyManualPickers && selectedAccountId !== 'auto' ? selectedAccountId : undefined,
          videoLocalPath: applyManualPickers ? (selectedVideoCandidate?.localPath || undefined) : undefined,
          videoPlatformId: applyManualPickers ? (selectedVideoCandidate?.platformId || undefined) : undefined,
          videoCampaignId: applyManualPickers ? (selectedVideoCandidate?.campaignId || undefined) : undefined,
          sourceName: applyManualPickers ? (selectedSourceCandidate?.sourceName || undefined) : undefined,
          sourceType: applyManualPickers ? (selectedSourceCandidate?.sourceType || undefined) : undefined,
          sourceCampaignId: applyManualPickers ? (selectedSourceCandidate?.campaignId || undefined) : undefined,
          randomSeed: caseMatchesPickerScope && autoRandomSeed.trim() ? autoRandomSeed.trim() : undefined,
        },
      })
      if (run?.id) setSelectedRunId(run.id)
      if (run?.status && run.status !== 'running') {
        setBusy(prev => ({ ...prev, [caseId]: false }))
        const extracted = parseRunMessages(run)
        const objective = String((caseDef?.meta as any)?.objective || '').trim() || undefined
        setLatestOutcome({
          caseId: run.caseId,
          title: run.title,
          objective,
          status: run.status,
          summary: run.summary,
          passedMessages: extracted.passedMessages,
          failReasons: extracted.failReasons,
          finishedAt: Date.now(),
        })
        setMessageTone(run.status === 'passed' ? 'info' : 'error')
        setMessage(
          run.status === 'passed'
            ? `Passed: ${run.title}${extracted.passedMessages[0] ? ` - ${extracted.passedMessages[0]}` : ''}`
            : `Failed: ${run.title}${extracted.failReasons[0] ? ` - ${extracted.failReasons[0]}` : ''}`
        )
      }
    } catch (err: any) {
      console.error('[TroubleShottingPanel] runCase failed', err)
      setBusy(prev => ({ ...prev, [caseId]: false }))
      setMessageTone('error')
      setMessage(`Run failed: ${err?.message || String(err)}`)
    }
  }

  const runAll = async () => {
    const runnableCases = filteredCases.filter(c => c.implemented !== false)
    if (runnableCases.length === 0) return

    setRunAllProgress({
      active: true,
      total: runnableCases.length,
      done: 0,
      currentCaseId: runnableCases[0]?.id,
    })
    setMessageTone('info')
    setMessage(`Run All started: ${runnableCases.length} case(s).`)

    try {
      for (let i = 0; i < runnableCases.length; i += 1) {
        const nextCase = runnableCases[i]
        setRunAllProgress((prev) => ({
          ...prev,
          currentCaseId: nextCase.id,
          done: i,
        }))
        // eslint-disable-next-line no-await-in-loop
        await runCase(nextCase.id)
      }
      setMessageTone('info')
      setMessage(`Run All completed: ${runnableCases.length}/${runnableCases.length} case(s) processed.`)
    } finally {
      setRunAllProgress((prev) => ({
        ...prev,
        active: false,
        done: prev.total,
        currentCaseId: undefined,
      }))
    }
  }

  const sendSelectedRunToSentry = async () => {
    if (!selectedRun?.id) return
    setSendingSentry(true)
    setMessage('')
    setSentryFeedback(null)
    try {
      const sent = await api.invoke('troubleshooting:send-run-to-sentry', { runId: selectedRun.id })
      const sentry = sent?.sentry || {}
      setSentryFeedback({
        eventId: sent?.eventId,
        eventUrl: sentry.eventUrl,
        eventApiUrl: sentry.eventApiUrl,
        issueSearchUrl: sentry.issueSearchUrl,
        verified: sentry.verified,
        verificationEnabled: sentry.verificationEnabled,
        strictRequired: sentry.strictRequired,
        message: sentry.message,
        lastError: sentry.lastError,
        attempts: sentry.attempts,
        elapsedMs: sentry.elapsedMs,
      })
      setMessageTone('info')
      if (sentry.verificationEnabled) {
        setMessage(
          sentry.verified
            ? `Sent + verified on Sentry staging for ${selectedRun.caseId}.`
            : `Sent but not verified yet for ${selectedRun.caseId}.`
        )
      } else {
        setMessage(`Sent run ${selectedRun.caseId} to Sentry (verification disabled).`)
      }
    } catch (err: any) {
      setMessageTone('error')
      setMessage(`Send to Sentry failed: ${err?.message || String(err)}`)
      setSentryFeedback(null)
    } finally {
      setSendingSentry(false)
    }
  }

  const clearRuns = async () => {
    try {
      await api.invoke('troubleshooting:clear-runs')
      setRuns([])
      setSelectedRunId(null)
      setSentryFeedback(null)
      setLatestOutcome(null)
      setRunAllProgress({ active: false, total: 0, done: 0 })
    } catch (err: any) {
      setMessageTone('error')
      setMessage(`Clear failed: ${err?.message || String(err)}`)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-vintage-white p-6 h-full text-vintage-charcoal">
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="rounded-2xl border border-vintage-border bg-vintage-cream/35 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">TroubleShotting</h1>
            <p className="text-sm text-vintage-gray mt-1">
              Run smoke/E2E checks and keep persistent logs for debugging user issues.
            </p>
            <p className="text-xs text-vintage-gray mt-1 opacity-80">
              Case catalog and workflow filter are loaded dynamically from existing troubleshooting providers. Main-level cases live under workflow `main`.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-xs text-vintage-charcoal">
              <input
                type="checkbox"
                checked={manualTiktokRepostPickersEnabled}
                onChange={(e) => setManualTiktokRepostPickersEnabled(e.target.checked)}
                className="accent-sky-600"
              />
              <span>Manual Runtime Pickers</span>
            </label>
            <input
              value={autoRandomSeed}
              onChange={(e) => setAutoRandomSeed(e.target.value)}
              placeholder="Auto Random Seed (optional)"
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal w-[220px]"
              title="Used by selected workflow auto-selection paths for reproducible debug reruns"
            />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={!manualPickersEnabled}
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal max-w-[240px] disabled:opacity-50"
              title="Manual account picker for the currently selected workflow scope"
            >
              <option value="auto">Debug Account: Auto Select</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.handle || (acc.username ? `@${acc.username}` : acc.id)}{acc.status ? ` | ${acc.status}` : ''}
                </option>
              ))}
            </select>
            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              disabled={!manualPickersEnabled}
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal max-w-[360px] disabled:opacity-50"
              title="Optional manual video picker for selected workflow debug cases"
            >
              <option value="auto">Debug Video ({activeWorkflowScope || 'select workflow'}): Auto Select</option>
              {videoCandidates.map(v => {
                const fileName = (v.localPath || '').split(/[\\/]/).pop() || v.localPath
                const campaign = v.campaignName || v.campaignId.slice(0, 8)
                const status = v.status || 'unknown'
                const label = `${campaign} | ${status} | ${v.platformId} | ${fileName}`
                return (
                  <option key={v.id} value={v.id}>
                    {label}
                  </option>
                )
              })}
            </select>
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              disabled={!manualPickersEnabled}
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal max-w-[360px] disabled:opacity-50"
              title="Optional manual source picker (channel/keyword) for selected workflow scan debug cases"
            >
              <option value="auto">Debug Source ({activeWorkflowScope || 'select workflow'}): Auto Random</option>
              {sourceCandidates.map(s => {
                const campaign = s.campaignName || s.campaignId.slice(0, 8)
                const label = `${campaign} | ${s.sourceType}:${s.sourceName}${s.minViews ? ` | minViews=${s.minViews}` : ''}${s.minLikes ? ` | minLikes=${s.minLikes}` : ''}`
                return (
                  <option key={s.id} value={s.id}>
                    {label}
                  </option>
                )
              })}
            </select>
            <select
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal"
            >
              <option value="all">All Workflows</option>
              {workflowOptions.map(w => (
                <option key={w.workflowId} value={w.workflowId}>
                  {w.workflowId} ({w.runnableCases}/{w.totalCases})
                </option>
              ))}
            </select>
            <select
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal"
            >
              <option value="all">All Versions</option>
              {versionOptions.map(v => (
                <option key={v} value={v}>
                  v{v}
                </option>
              ))}
            </select>
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal hover:border-pastel-blue hover:bg-pastel-blue/20 transition disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={runAll}
              disabled={
                loading ||
                runAllProgress.active ||
                filteredCases.filter(c => c.implemented !== false).length === 0 ||
                Object.values(busy).some(Boolean)
              }
              className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm hover:bg-amber-100 transition disabled:opacity-50"
            >
              Run All Runnable
            </button>
            <button
              onClick={clearRuns}
              className="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm hover:bg-rose-100 transition"
            >
              Clear Logs
            </button>
          </div>
        </div>
        {runAllProgress.active && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 mt-3">
            <div className="flex items-center justify-between text-xs text-sky-700">
              <span className="font-semibold">Run All Runnable progress</span>
              <span>{Math.min(runAllProgress.done, runAllProgress.total)}/{runAllProgress.total}</span>
            </div>
            <div className="h-2 rounded-full bg-sky-100 overflow-hidden mt-2">
              <div
                className="h-full bg-sky-500 transition-all"
                style={{ width: `${runAllProgress.total > 0 ? (Math.min(runAllProgress.done, runAllProgress.total) / runAllProgress.total) * 100 : 0}%` }}
              />
            </div>
            {runAllProgress.currentCaseId && (
              <div className="text-[11px] text-sky-700 mt-2">
                Current case:{' '}
                <span className="font-mono">{caseMap.get(runAllProgress.currentCaseId)?.title || runAllProgress.currentCaseId}</span>
              </div>
            )}
          </div>
        )}
      </div>

        {message && (
          <div className={`rounded-lg border text-sm px-3 py-2 ${
            messageTone === 'info'
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}>
            {message}
            {sentryFeedback && (
              <div className="mt-2 space-y-1 text-xs">
                {sentryFeedback.message && (
                  <div className="text-vintage-gray">{sentryFeedback.message}</div>
                )}
                {!!sentryFeedback.eventId && (
                  <div>
                    eventId: <span className="font-mono text-vintage-charcoal">{sentryFeedback.eventId}</span>
                  </div>
                )}
                {(typeof sentryFeedback.attempts === 'number' || typeof sentryFeedback.elapsedMs === 'number') && (
                  <div className="text-vintage-gray">
                    attempts={sentryFeedback.attempts ?? 0}
                    {typeof sentryFeedback.elapsedMs === 'number' ? `, elapsed=${sentryFeedback.elapsedMs}ms` : ''}
                  </div>
                )}
                {sentryFeedback.lastError && (
                  <div className="text-amber-700">lastError: {sentryFeedback.lastError}</div>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {sentryFeedback.eventUrl && (
                    <a
                      href={sentryFeedback.eventUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-sky-700 hover:text-sky-800"
                    >
                      Open Sentry Event
                    </a>
                  )}
                  {sentryFeedback.issueSearchUrl && (
                    <a
                      href={sentryFeedback.issueSearchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-sky-700 hover:text-sky-800"
                    >
                      Open Sentry Issue Search
                    </a>
                  )}
                  {sentryFeedback.eventApiUrl && (
                    <button
                      onClick={() => navigator.clipboard?.writeText(sentryFeedback.eventApiUrl || '').catch(() => {})}
                      className="px-2 py-0.5 rounded border border-vintage-border text-[10px] text-vintage-charcoal hover:bg-vintage-cream/70"
                    >
                      Copy Event API URL
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-vintage-border bg-vintage-cream/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-wider text-vintage-gray">Workflow Catalog</p>
            <span className="text-xs text-vintage-gray">{workflowOptions.length} workflow(s)</span>
          </div>
          {workflowOptions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {workflowOptions.map((workflow) => (
                <button
                  key={`wf-${workflow.workflowId}`}
                  onClick={() => {
                    setWorkflowFilter(workflow.workflowId)
                    setVersionFilter('all')
                  }}
                  data-testid="workflow-card"
                  data-workflow-id={workflow.workflowId}
                  className={`text-left rounded-lg border px-3 py-2 transition ${
                    workflowFilter === workflow.workflowId
                      ? 'border-sky-300 bg-sky-50'
                      : 'border-vintage-border bg-vintage-white hover:border-sky-300'
                  }`}
                >
                  <div className="text-sm font-mono text-vintage-charcoal">{workflow.workflowId}</div>
                  <div className="text-[11px] text-vintage-gray mt-1">versions: {workflow.versions.join(', ')}</div>
                  <div className="text-[11px] text-vintage-gray mt-1">
                    runnable={workflow.runnableCases} / total={workflow.totalCases} / planned={workflow.plannedCases}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-vintage-gray">No workflow providers discovered.</div>
          )}
        </div>

        {manualTiktokRepostPickersEnabled && !activeWorkflowScope && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Manual runtime pickers are enabled. Select a specific workflow to load workflow-scoped account/video/source candidates.
          </div>
        )}

        {((!!activeWorkflowScope && !!autoRandomSeed.trim()) || (manualPickersEnabled && (selectedAccountId !== 'auto' || selectedVideoId !== 'auto' || selectedSourceId !== 'auto'))) && (
          <div className="rounded-lg border border-vintage-border bg-vintage-white px-3 py-2 text-xs text-vintage-gray">
            {!!activeWorkflowScope && autoRandomSeed.trim() && (
              <div>Auto random seed ({activeWorkflowScope}): <span className="font-mono text-vintage-charcoal">{autoRandomSeed.trim()}</span></div>
            )}
            <div>
              Debug account: {selectedAccountId === 'auto'
                ? 'Auto Select'
                : (accounts.find(a => a.id === selectedAccountId)?.handle || accounts.find(a => a.id === selectedAccountId)?.username || selectedAccountId)}
            </div>
            <div className="truncate">
              Debug video ({activeWorkflowScope || 'unscoped'}): {selectedVideoCandidate
                ? `${selectedVideoCandidate.campaignName || selectedVideoCandidate.campaignId} | ${selectedVideoCandidate.platformId} | ${selectedVideoCandidate.localPath}`
                : 'Auto Select'}
            </div>
            <div className="truncate">
              Debug source ({activeWorkflowScope || 'unscoped'}): {selectedSourceCandidate
                ? `${selectedSourceCandidate.campaignName || selectedSourceCandidate.campaignId} | ${selectedSourceCandidate.sourceType}:${selectedSourceCandidate.sourceName}`
                : 'Auto Random'}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-vintage-border bg-vintage-cream/30 p-4">
            <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Latest Execution Insight</p>
            {latestOutcome ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-vintage-charcoal">{latestOutcome.title}</p>
                    <p className="text-[11px] text-vintage-gray font-mono">{latestOutcome.caseId}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${statusChip[latestOutcome.status]}`}>
                    {latestOutcome.status}
                  </span>
                </div>
                {latestOutcome.objective && (
                  <p className="text-xs text-vintage-gray">
                    What this test validates: <span className="text-vintage-charcoal">{latestOutcome.objective}</span>
                  </p>
                )}
                {latestOutcome.status === 'passed' ? (
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Message when passed</p>
                    <ul className="list-disc list-inside text-xs text-vintage-gray space-y-1">
                      {(latestOutcome.passedMessages.length > 0 ? latestOutcome.passedMessages : [latestOutcome.summary || 'Case completed successfully.']).slice(0, 4).map((line, idx) => (
                        <li key={`latest-pass-${idx}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-rose-700 mb-1">Failure reasons (detailed)</p>
                    <ul className="list-disc list-inside text-xs text-vintage-gray space-y-1">
                      {(latestOutcome.failReasons.length > 0 ? latestOutcome.failReasons : [latestOutcome.summary || 'Unknown failure']).slice(0, 4).map((line, idx) => (
                        <li key={`latest-fail-${idx}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-vintage-gray">No finished run yet. Trigger a case or Run All Runnable to see insight.</p>
            )}
          </div>

          <div className="rounded-xl border border-vintage-border bg-vintage-cream/30 p-4">
            <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Selected Run Intent</p>
            {selectedRun ? (
              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-semibold text-vintage-charcoal">{selectedRun.title}</p>
                  <p className="text-[11px] text-vintage-gray font-mono">{selectedRun.caseId}</p>
                </div>
                <p className="text-xs text-vintage-gray">
                  What this test validates:{' '}
                  <span className="text-vintage-charcoal">
                    {selectedRunOutcome?.objective || selectedRun.summary || selectedCaseDef?.description || 'No objective metadata.'}
                  </span>
                </p>
                <div>
                  <p className="text-xs font-semibold text-emerald-700 mb-1">Message when passed</p>
                  <ul className="list-disc list-inside text-xs text-vintage-gray space-y-1">
                    {(selectedRunOutcome?.passedMessages?.length ? selectedRunOutcome.passedMessages : selectedRunOutcome?.expectedPassMessages || []).slice(0, 4).map((line, idx) => (
                      <li key={`selected-pass-${idx}`}>{line}</li>
                    ))}
                    {!(selectedRunOutcome?.passedMessages?.length || selectedRunOutcome?.expectedPassMessages?.length) && (
                      <li>{selectedRun.status === 'passed' ? (selectedRun.summary || 'Case completed successfully.') : 'Will be shown after run passes.'}</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-rose-700 mb-1">Failure reasons (detailed)</p>
                  <ul className="list-disc list-inside text-xs text-vintage-gray space-y-1">
                    {(selectedRunOutcome?.failReasons?.length ? selectedRunOutcome.failReasons : selectedRunOutcome?.expectedErrorMessages || []).slice(0, 4).map((line, idx) => (
                      <li key={`selected-fail-${idx}`}>{line}</li>
                    ))}
                    {selectedRunErrorTail.slice(-2).map((entry, idx) => (
                      <li key={`selected-fail-log-${idx}`}>{entry.line}</li>
                    ))}
                    {!(selectedRunOutcome?.failReasons?.length || selectedRunOutcome?.expectedErrorMessages?.length || selectedRunErrorTail.length) && (
                      <li>{selectedRun.status === 'failed' ? (selectedRun.summary || 'No explicit failure reason from runner.') : 'Will be shown after run fails.'}</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-vintage-gray">Select a run to inspect objective, pass messages, and failure reasons.</p>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-vintage-border bg-vintage-cream/35 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-vintage-gray">Test Cases</p>
                <span className="text-xs text-vintage-gray">
                  {filteredCases.length}/{cases.length} cases
                </span>
              </div>
              <div className="text-[11px] text-vintage-gray mb-3">
                Filter: <span className="font-mono text-vintage-charcoal">{workflowFilter === 'all' ? 'all workflows' : workflowFilter}</span>
                {' | '}
                <span className="font-mono text-vintage-charcoal">{versionFilter === 'all' ? 'all versions' : `v${versionFilter}`}</span>
              </div>
              <div className="space-y-4">
                {groupedCases.map(suiteSection => (
                  <div key={suiteSection.suite} className="space-y-3">
                    <div
                      className="flex items-center justify-between rounded-lg border border-vintage-border bg-vintage-cream/35 px-3 py-2"
                      data-suite-heading={suiteSection.suite}
                    >
                      <p className="text-xs uppercase tracking-wider text-vintage-gray">
                        Suite: <span className="text-vintage-charcoal">{suiteSection.label}</span>
                      </p>
                      <span className="text-[11px] text-vintage-gray">{suiteSection.count} case(s)</span>
                    </div>
                    {suiteSection.groups.map(section => (
                      <div key={`${suiteSection.suite}-${section.group}`} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-wider text-vintage-gray">
                            Group: <span className="text-vintage-charcoal">{section.group}</span>
                          </p>
                          <span className="text-[11px] text-vintage-gray">{section.items.length} case(s)</span>
                        </div>
                        {section.items.map(c => {
                          const isRunning = !!busy[c.id] || runs.some(r => r.caseId === c.id && r.status === 'running')
                          const dbChecks = c.meta?.checks?.db?.length || 0
                          const uiChecks = c.meta?.checks?.ui?.length || 0
                          const logChecks = c.meta?.checks?.logs?.length || 0
                          const caseObjective = String((c.meta as any)?.objective || '').trim()
                          const expectedPass = (c.meta?.passMessages || [])[0]
                          const expectedFail = (c.meta?.errorMessages || [])[0]
                          return (
                            <div
                              key={c.id}
                              data-testid="trouble-case-card"
                              data-case-id={c.id}
                              className="rounded-lg border border-vintage-border bg-vintage-white p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold">{c.title}</p>
                                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                                      c.risk === 'real_publish'
                                        ? 'text-rose-700 border-rose-200 bg-rose-50'
                                        : 'text-emerald-700 border-emerald-200 bg-emerald-50'
                                    }`}>
                                      {c.risk === 'real_publish' ? 'Real Publish' : 'Safe'}
                                    </span>
                                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                                      c.implemented === false
                                        ? 'text-slate-700 border-slate-200 bg-slate-50'
                                        : 'text-sky-700 border-sky-200 bg-sky-50'
                                    }`}>
                                      {c.implemented === false ? 'Planned' : 'Runnable'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-vintage-gray mt-1">{c.description}</p>
                                  {caseObjective && (
                                    <p className="text-[11px] text-vintage-charcoal mt-2">
                                      What this test validates: <span className="text-vintage-gray">{caseObjective}</span>
                                    </p>
                                  )}
                                  {expectedPass && (
                                    <p className="text-[11px] text-emerald-700 mt-1">
                                      Message when passed: <span className="text-vintage-charcoal">{expectedPass}</span>
                                    </p>
                                  )}
                                  {expectedFail && (
                                    <p className="text-[11px] text-rose-700 mt-1">
                                      Failure reason hint: <span className="text-vintage-charcoal">{expectedFail}</span>
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {(c.workflowId || c.workflowVersion) && (
                                      <span className="text-[10px] px-2 py-0.5 rounded border border-vintage-border text-vintage-gray bg-vintage-cream/60 font-mono">
                                        {c.workflowId || 'unscoped'}{c.workflowVersion ? `@v${c.workflowVersion}` : ''}
                                      </span>
                                    )}
                                    {c.category && (
                                      <span className="text-[10px] px-2 py-0.5 rounded border border-vintage-border text-vintage-gray bg-vintage-cream/60">
                                        {c.category}
                                      </span>
                                    )}
                                    {c.level && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                        c.level === 'basic'
                                          ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                          : c.level === 'intermediate'
                                            ? 'border-amber-200 text-amber-700 bg-amber-50'
                                            : 'border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50'
                                      }`}>
                                        {c.level}
                                      </span>
                                    )}
                                    {(c.tags || []).slice(0, 6).map(tag => (
                                      <span key={`${c.id}-${tag}`} className="text-[10px] px-2 py-0.5 rounded border border-vintage-border text-vintage-gray bg-vintage-white">
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="text-[11px] text-vintage-gray mt-2 flex flex-wrap gap-3">
                                    <span>Params: {c.meta?.parameters?.length || 0}</span>
                                    <span>DB checks: {dbChecks}</span>
                                    <span>UI checks: {uiChecks}</span>
                                    <span>Log checks: {logChecks}</span>
                                  </div>
                                  <p className="text-[11px] text-vintage-gray mt-2 font-mono">{c.id}</p>
                                  {c.fingerprint && (
                                    <p className="text-[11px] text-vintage-gray mt-1 font-mono">fp={c.fingerprint}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => runCase(c.id)}
                                  disabled={isRunning || c.implemented === false}
                                  data-testid="run-case-button"
                                  data-case-id={c.id}
                                  className="px-3 py-1.5 rounded-lg text-sm border border-sky-300 text-sky-700 hover:bg-sky-50 hover:border-sky-400 transition disabled:opacity-50"
                                >
                                  {c.implemented === false ? 'Planned' : (isRunning ? 'Running...' : 'Run')}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ))}
                {filteredCases.length === 0 && (
                  <div className="text-sm text-vintage-gray py-6 text-center">No troubleshooting cases for this workflow/version.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-vintage-border bg-vintage-cream/35 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-vintage-gray">Run History</p>
                <span className="text-xs text-vintage-gray">{filteredRuns.length}/{runs.length} runs</span>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredRuns.map(run => {
                  const runCaseDef = caseMap.get(run.caseId)
                  const runObjective = String((runCaseDef?.meta as any)?.objective || '').trim()
                  const runMessages = parseRunMessages(run)
                  const passLine = runMessages.passedMessages[0]
                  const failLine = runMessages.failReasons[0]
                  return (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRunId(run.id)}
                      data-testid="run-history-item"
                      data-run-id={run.id}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                        selectedRunId === run.id
                          ? 'border-sky-300 bg-sky-50'
                          : 'border-vintage-border bg-vintage-white hover:border-vintage-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{run.title}</p>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${statusChip[run.status] || statusChip.failed}`}>
                          {run.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-vintage-gray mt-1">
                        {new Date(run.startedAt).toLocaleString('vi-VN')}
                      </p>
                      {(run.workflowId || run.workflowVersion) && (
                        <p className="text-[10px] text-vintage-gray mt-1 font-mono">
                          {(run.workflowId || 'unscoped')}{run.workflowVersion ? `@v${run.workflowVersion}` : ''}
                          {run.category ? ` | ${run.category}` : ''}
                          {run.level ? ` | ${run.level}` : ''}
                        </p>
                      )}
                      {runObjective && (
                        <p className="text-[11px] text-vintage-charcoal mt-1 line-clamp-2">
                          What this test validates: <span className="text-vintage-gray">{runObjective}</span>
                        </p>
                      )}
                      {run.status === 'passed' && (
                        <p className="text-[11px] text-emerald-700 mt-1 line-clamp-2">
                          Message when passed: <span className="text-vintage-charcoal">{passLine || run.summary || '(no pass message)'}</span>
                        </p>
                      )}
                      {run.status === 'failed' && (
                        <p className="text-[11px] text-rose-700 mt-1 line-clamp-2">
                          Failure reason: <span className="text-vintage-charcoal">{failLine || run.summary || '(no failure detail)'}</span>
                        </p>
                      )}
                      {run.summary && <p className="text-xs text-vintage-gray mt-1 line-clamp-2">{run.summary}</p>}
                    </button>
                  )
                })}
                {filteredRuns.length === 0 && (
                  <div className="text-sm text-vintage-gray py-6 text-center">No runs for this workflow/version.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-vintage-border bg-vintage-cream/35 p-4 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-vintage-gray">Run Details</p>
                {selectedRun ? (
                  <p className="text-sm text-vintage-charcoal mt-1">{selectedRun.title}</p>
                ) : (
                  <p className="text-sm text-vintage-gray mt-1">Select a run to inspect logs.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedRun && (
                  <>
                    <button
                      onClick={() => setFullLogOpen(true)}
                      className="px-2.5 py-1.5 rounded-lg border border-vintage-border text-xs text-vintage-charcoal hover:border-pastel-blue"
                    >
                      View Full Log
                    </button>
                    {selectedRun.status === 'failed' && (
                      <button
                        onClick={sendSelectedRunToSentry}
                        disabled={sendingSentry}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {sendingSentry ? 'Sending...' : 'Send To Sentry'}
                      </button>
                    )}
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${statusChip[selectedRun.status] || statusChip.failed}`}>
                      {selectedRun.status}
                    </span>
                  </>
                )}
              </div>
            </div>

            {selectedRun ? (
              <div className="flex-1 min-h-0 space-y-3">
                <div className="rounded-lg border border-vintage-border bg-vintage-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Summary</p>
                  <p className="text-sm text-vintage-charcoal">{selectedRun.summary || '(no summary yet)'}</p>
                  <div className="text-xs text-vintage-gray mt-2 space-y-1">
                    <div>Started: {new Date(selectedRun.startedAt).toLocaleString('vi-VN')}</div>
                    {selectedRun.endedAt && <div>Ended: {new Date(selectedRun.endedAt).toLocaleString('vi-VN')}</div>}
                    <div>Case: <span className="font-mono">{selectedRun.caseId}</span></div>
                    {selectedRun.caseFingerprint && (
                      <div>Case FP: <span className="font-mono">{selectedRun.caseFingerprint}</span></div>
                    )}
                    {selectedRun.runFingerprint && (
                      <div>Run FP: <span className="font-mono">{selectedRun.runFingerprint}</span></div>
                    )}
                    {(selectedRun.workflowId || selectedRun.workflowVersion) && (
                      <div>
                        Workflow: <span className="font-mono">
                          {(selectedRun.workflowId || 'unscoped')}{selectedRun.workflowVersion ? `@v${selectedRun.workflowVersion}` : ''}
                        </span>
                        {selectedRun.category ? ` | ${selectedRun.category}` : ''}
                        {selectedRun.group ? ` | group:${selectedRun.group}` : ''}
                        {selectedRun.level ? ` | ${selectedRun.level}` : ''}
                      </div>
                    )}
                    {selectedRun.tags && selectedRun.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedRun.tags.map(tag => (
                          <span key={`${selectedRun.id}-${tag}`} className="text-[10px] px-1.5 py-0.5 rounded border border-vintage-border text-vintage-gray">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedRun.logStats && (
                      <div>
                        Logs: total={selectedRun.logStats.total} | info={selectedRun.logStats.info} | warn={selectedRun.logStats.warn} | error={selectedRun.logStats.error}
                      </div>
                    )}
                    {(selectedRun.artifactManifestPath || selectedRun.footprintPath) && (
                      <div className="space-y-1">
                        {selectedRun.artifactManifestPath && (
                          <div className="break-all">Artifact Manifest: <span className="font-mono">{selectedRun.artifactManifestPath}</span></div>
                        )}
                        {selectedRun.footprintPath && (
                          <div className="break-all">Footprint File: <span className="font-mono">{selectedRun.footprintPath}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-vintage-border bg-vintage-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Case Meta</p>
                  {selectedRun.caseMeta ? (
                    <div className="space-y-3 text-xs text-vintage-gray">
                      {(selectedRun.caseMeta.parameters || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-vintage-gray mb-1 uppercase tracking-wider">Parameters</p>
                          <div className="space-y-1">
                            {(selectedRun.caseMeta.parameters || []).map((p, idx) => (
                              <div key={`${selectedRun.id}-param-${idx}`} className="rounded border border-vintage-border bg-vintage-cream/35 px-2 py-1">
                                <span className="font-mono text-sky-700">{p.key}</span>
                                {p.value !== undefined && <span className="text-vintage-gray"> = {String(p.value)}</span>}
                                {p.required && <span className="text-rose-700"> (required)</span>}
                                {p.description && <span className="text-vintage-gray"> | {p.description}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedRun.caseMeta.checks && (
                        <div className="grid grid-cols-1 gap-2">
                          {(['db', 'ui', 'logs', 'events', 'files'] as const).map(section => {
                            const items = selectedRun.caseMeta?.checks?.[section] || []
                            if (items.length === 0) return null
                            return (
                              <div key={`${selectedRun.id}-checks-${section}`} className="rounded border border-vintage-border bg-vintage-cream/35 p-2">
                                <p className="text-[11px] text-vintage-gray mb-1 uppercase tracking-wider">{section} checks</p>
                                <ul className="list-disc list-inside space-y-1 text-vintage-gray">
                                  {items.map((item, idx) => <li key={`${section}-${idx}`}>{item}</li>)}
                                </ul>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {(selectedRun.caseMeta.artifacts || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-vintage-gray mb-1 uppercase tracking-wider">Artifact Plan</p>
                          <div className="space-y-1">
                            {(selectedRun.caseMeta.artifacts || []).map((artifact, idx) => (
                              <div key={`${selectedRun.id}-artifact-plan-${idx}`} className="rounded border border-vintage-border bg-vintage-cream/35 px-2 py-1">
                                <span className="font-mono text-violet-700">{artifact.key}</span>
                                <span className="text-vintage-gray"> | {artifact.type}</span>
                                {artifact.when && <span className="text-vintage-gray"> | when={artifact.when}</span>}
                                {artifact.required && <span className="text-amber-700"> | required</span>}
                                {artifact.description && <span className="text-vintage-gray"> | {artifact.description}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(selectedRun.caseMeta.passMessages || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-vintage-gray mb-1 uppercase tracking-wider">Pass Criteria / Messages</p>
                          <ul className="list-disc list-inside space-y-1 text-vintage-gray">
                            {(selectedRun.caseMeta.passMessages || []).map((m, idx) => <li key={`pass-${idx}`}>{m}</li>)}
                          </ul>
                        </div>
                      )}

                      {(selectedRun.caseMeta.errorMessages || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-vintage-gray mb-1 uppercase tracking-wider">Error Expectations</p>
                          <ul className="list-disc list-inside space-y-1 text-vintage-gray">
                            {(selectedRun.caseMeta.errorMessages || []).map((m, idx) => <li key={`err-${idx}`}>{m}</li>)}
                          </ul>
                        </div>
                      )}

                      {(selectedRun.caseMeta.notes || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-vintage-gray mb-1 uppercase tracking-wider">Notes</p>
                          <ul className="list-disc list-inside space-y-1 text-vintage-gray">
                            {(selectedRun.caseMeta.notes || []).map((m, idx) => <li key={`note-${idx}`}>{m}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-vintage-gray">No case metadata snapshot.</div>
                  )}
                </div>

                <div className="rounded-lg border border-vintage-border bg-vintage-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Artifacts</p>
                  {selectedRunArtifacts.length > 0 ? (
                    <div className="space-y-2">
                      {selectedRunArtifacts.map(({ key, textValue, preview, mode, imageSrc }) => {
                        return (
                          <div key={`${selectedRun.id}-artifact-${key}`} className="rounded border border-vintage-border bg-vintage-cream/35 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-sky-700">{key}</span>
                              <button
                                onClick={() => navigator.clipboard?.writeText(textValue).catch(() => {})}
                                className="px-2 py-0.5 rounded border border-vintage-border text-[10px] text-vintage-charcoal hover:border-pastel-blue"
                              >
                                Copy
                              </button>
                            </div>
                            {mode === 'image' && imageSrc ? (
                              <div className="mt-2 rounded border border-vintage-border bg-vintage-cream/20 overflow-hidden">
                                <img
                                  src={imageSrc}
                                  alt={`Screenshot artifact: ${key}`}
                                  data-artifact-kind="image"
                                  className="w-full max-h-[260px] object-contain bg-vintage-cream/30"
                                />
                              </div>
                            ) : (
                              <pre className="text-[11px] text-vintage-gray whitespace-pre-wrap break-words mt-1">{preview}</pre>
                            )}
                            {mode === 'image' && (
                              <p className="text-[11px] text-vintage-gray break-all mt-2">{preview}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-vintage-gray">No artifact outputs recorded for this run.</div>
                  )}
                </div>

                <div className="rounded-lg border border-vintage-border bg-vintage-white p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-vintage-gray">AI Debug Footprint</p>
                    <button
                      onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRun.diagnosticFootprint || {}, null, 2)).catch(() => {})}
                      className="px-2 py-1 rounded border border-vintage-border text-[10px] text-vintage-charcoal hover:border-pastel-blue"
                    >
                      Copy Footprint JSON
                    </button>
                  </div>
                  {selectedRun.diagnosticFootprint ? (
                    <div className="space-y-2">
                      <div className="text-xs text-vintage-gray">
                        schema={selectedRun.diagnosticFootprint?.schemaVersion || 1}
                        {selectedRun.diagnosticFootprint?.execution?.durationMs !== undefined && (
                          <span> | duration={selectedRun.diagnosticFootprint.execution.durationMs}ms</span>
                        )}
                        {selectedRun.diagnosticFootprint?.signals && (
                          <span>
                            {' '}| errors={selectedRun.diagnosticFootprint.signals.errorCount}
                            {' '}warns={selectedRun.diagnosticFootprint.signals.warnCount}
                          </span>
                        )}
                      </div>
                      {selectedRun.footprintPath && (
                        <div className="text-[11px] text-vintage-gray break-all">
                          footprint_file={selectedRun.footprintPath}
                        </div>
                      )}
                      <pre className="text-[11px] text-vintage-gray whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
                        {selectedRunFootprintPreview}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-xs text-vintage-gray">
                      No diagnostic footprint yet (generated on case completion/failure).
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-vintage-border bg-vintage-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Result Payload</p>
                  <pre className="text-[11px] text-vintage-gray whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto">
                    {JSON.stringify(selectedRun.result || {}, null, 2)}
                  </pre>
                </div>

                <div className="rounded-lg border border-vintage-border bg-vintage-cream/20 p-3 flex-1 min-h-0">
                  <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Logs ({selectedRun.logs?.length || 0})</p>
                  {selectedRun.logStats && selectedRun.logStats.total > (selectedRun.logs?.length || 0) && (
                    <p className="text-[10px] text-amber-700 mb-2">
                      Showing last {selectedRun.logs?.length || 0}/{selectedRun.logStats.total} log lines (history capped).
                    </p>
                  )}
                  <div className="font-mono text-[11px] space-y-1 max-h-[360px] overflow-y-auto pr-1">
                    {(selectedRun.logs || []).map((entry, idx) => (
                      <div key={`${entry.ts}-${idx}`} className="rounded px-2 py-1 hover:bg-pastel-blue/20">
                        <span className="text-vintage-gray mr-2">
                          {new Date(entry.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className={`mr-2 uppercase ${levelColor[entry.level] || levelColor.info}`}>{entry.level}</span>
                        <span className="text-vintage-charcoal break-words">{entry.line}</span>
                      </div>
                    ))}
                    {(selectedRun.logs || []).length === 0 && (
                      <div className="text-vintage-gray">No logs recorded.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 grid place-items-center text-sm text-vintage-gray">
                No run selected.
              </div>
            )}
          </div>
        </div>
      </div>

      {fullLogOpen && selectedRun && (
        <div className="fixed inset-0 z-50 bg-vintage-charcoal/20 backdrop-blur-sm p-4">
          <div className="max-w-6xl mx-auto h-full rounded-xl border border-vintage-border bg-vintage-white flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-vintage-border">
              <div>
                <p className="text-sm font-semibold text-vintage-charcoal">Full Run Log</p>
                <p className="text-xs text-vintage-gray font-mono">{selectedRun.caseId} | {selectedRun.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRun, null, 2)).catch(() => {})}
                  className="px-2.5 py-1.5 rounded-lg border border-vintage-border text-xs text-vintage-charcoal hover:border-pastel-blue"
                >
                  Copy Run JSON
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRun.diagnosticFootprint || {}, null, 2)).catch(() => {})}
                  className="px-2.5 py-1.5 rounded-lg border border-sky-300 text-xs text-sky-700 hover:bg-sky-50"
                >
                  Copy Footprint
                </button>
                <button
                  onClick={() => setFullLogOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-xs text-rose-700 hover:bg-rose-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-3 p-4 min-h-0 flex-1">
              <div className="rounded-lg border border-vintage-border bg-vintage-cream/20 p-3 min-h-0 flex flex-col">
                <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">
                  Full Timeline Logs ({selectedRun.logs?.length || 0}{selectedRun.logStats ? `/${selectedRun.logStats.total}` : ''})
                </p>
                <div className="font-mono text-[11px] space-y-1 overflow-y-auto pr-1 min-h-0">
                  {(selectedRun.logs || []).map((entry, idx) => (
                    <div key={`full-${entry.ts}-${idx}`} className="rounded px-2 py-1 hover:bg-pastel-blue/20">
                      <span className="text-vintage-gray mr-2">
                        {new Date(entry.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`mr-2 uppercase ${levelColor[entry.level] || levelColor.info}`}>{entry.level}</span>
                      <span className="text-vintage-charcoal break-words">{entry.line}</span>
                    </div>
                  ))}
                  {(selectedRun.logs || []).length === 0 && (
                    <div className="text-vintage-gray">No logs recorded.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-vintage-border bg-vintage-cream/35 p-3 min-h-0 flex flex-col">
                <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Run Snapshot</p>
                <pre className="text-[11px] text-vintage-gray whitespace-pre-wrap break-words overflow-y-auto min-h-0">
                  {JSON.stringify(selectedRun, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



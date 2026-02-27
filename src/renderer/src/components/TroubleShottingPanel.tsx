import { useEffect, useMemo, useState } from 'react'
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

const levelColor: Record<string, string> = {
  info: 'text-gray-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
}

const statusChip: Record<string, string> = {
  running: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  passed: 'text-green-300 bg-green-500/10 border-green-500/30',
  failed: 'text-red-300 bg-red-500/10 border-red-500/30',
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

  const workflowOptions = useMemo(() => {
    const byWorkflow = new Map<string, Set<string>>()
    for (const c of cases) {
      const workflowId = c.workflowId || 'unscoped'
      const version = c.workflowVersion || 'unversioned'
      if (!byWorkflow.has(workflowId)) byWorkflow.set(workflowId, new Set())
      byWorkflow.get(workflowId)?.add(version)
    }
    return [...byWorkflow.entries()]
      .map(([workflowId, versions]) => ({
        workflowId,
        versions: [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      }))
      .sort((a, b) => a.workflowId.localeCompare(b.workflowId))
  }, [cases])

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
      if (workflowFilter !== 'all' && (r.workflowId || 'unscoped') !== workflowFilter) return false
      if (versionFilter !== 'all' && (r.workflowVersion || 'unversioned') !== versionFilter) return false
      return true
    })
  }, [runs, workflowFilter, versionFilter])

  const selectedRun = useMemo(
    () => filteredRuns.find(r => r.id === selectedRunId) || filteredRuns[0] || null,
    [filteredRuns, selectedRunId]
  )

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

  const load = async () => {
    setLoading(true)
    try {
      const [caseList, runList, accountList, videoList, sourceList] = await Promise.all([
        api.invoke('troubleshooting:list-cases'),
        api.invoke('troubleshooting:list-runs', { limit: 50 }),
        api.invoke('account:list').catch(() => []),
        api.invoke('troubleshooting:list-video-candidates', { workflowId: 'tiktok-repost', limit: 100 }).catch(() => []),
        api.invoke('troubleshooting:list-source-candidates', { workflowId: 'tiktok-repost', limit: 100 }).catch(() => []),
      ])
      setCases(Array.isArray(caseList) ? caseList : [])
      setRuns(Array.isArray(runList) ? runList : [])
      setAccounts(Array.isArray(accountList) ? accountList : [])
      setVideoCandidates(Array.isArray(videoList) ? videoList : [])
      setSourceCandidates(Array.isArray(sourceList) ? sourceList : [])
      setSelectedRunId((prev: string | null) => prev || (Array.isArray(runList) && runList[0]?.id) || null)
    } catch (err: any) {
      console.error('[TroubleShottingPanel] load failed', err)
      setMessageTone('error')
      setMessage(`Load failed: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

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
        const videoList = await api.invoke('troubleshooting:list-video-candidates', { workflowId: 'tiktok-repost', limit: 100 })
        setVideoCandidates(Array.isArray(videoList) ? videoList : [])
      } catch {}
    })
    const offTroubleRefreshSources = api.on?.('troubleshooting:refresh-sources', async () => {
      try {
        const sourceList = await api.invoke('troubleshooting:list-source-candidates', { workflowId: 'tiktok-repost', limit: 100 })
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
  }, [])

  const runCase = async (caseId: string) => {
    setBusy(prev => ({ ...prev, [caseId]: true }))
    setMessage('')
    setSentryFeedback(null)
    try {
      const caseDef = cases.find(c => c.id === caseId)
      const isTiktokRepostCase = caseDef?.workflowId === 'tiktok-repost'
      const applyTiktokRepostManualPickers =
        manualTiktokRepostPickersEnabled && isTiktokRepostCase
      const run = await api.invoke('troubleshooting:run-case', {
        caseId,
        runtime: {
          accountId: applyTiktokRepostManualPickers && selectedAccountId !== 'auto' ? selectedAccountId : undefined,
          videoLocalPath: applyTiktokRepostManualPickers ? (selectedVideoCandidate?.localPath || undefined) : undefined,
          videoPlatformId: applyTiktokRepostManualPickers ? (selectedVideoCandidate?.platformId || undefined) : undefined,
          videoCampaignId: applyTiktokRepostManualPickers ? (selectedVideoCandidate?.campaignId || undefined) : undefined,
          sourceName: applyTiktokRepostManualPickers ? (selectedSourceCandidate?.sourceName || undefined) : undefined,
          sourceType: applyTiktokRepostManualPickers ? (selectedSourceCandidate?.sourceType || undefined) : undefined,
          sourceCampaignId: applyTiktokRepostManualPickers ? (selectedSourceCandidate?.campaignId || undefined) : undefined,
          randomSeed: isTiktokRepostCase && autoRandomSeed.trim() ? autoRandomSeed.trim() : undefined,
        },
      })
      if (run?.id) setSelectedRunId(run.id)
      if (run?.status && run.status !== 'running') {
        setBusy(prev => ({ ...prev, [caseId]: false }))
      }
    } catch (err: any) {
      console.error('[TroubleShottingPanel] runCase failed', err)
      setBusy(prev => ({ ...prev, [caseId]: false }))
      setMessageTone('error')
      setMessage(`Run failed: ${err?.message || String(err)}`)
    }
  }

  const runAll = async () => {
    for (const c of filteredCases) {
      if (c.implemented === false) continue
      // eslint-disable-next-line no-await-in-loop
      await runCase(c.id)
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
    } catch (err: any) {
      setMessageTone('error')
      setMessage(`Clear failed: ${err?.message || String(err)}`)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 p-6 h-full text-white">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">TroubleShotting</h1>
            <p className="text-sm text-gray-400 mt-1">
              Run smoke/E2E checks and keep persistent logs for debugging user issues.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Manual account/video pickers apply only to TikTok Repost when enabled. Otherwise tests use auto mode (including random video selection for publish debug).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-xs text-gray-200">
              <input
                type="checkbox"
                checked={manualTiktokRepostPickersEnabled}
                onChange={(e) => setManualTiktokRepostPickersEnabled(e.target.checked)}
                className="accent-cyan-500"
              />
              <span>Manual Pickers (TikTok Repost)</span>
            </label>
            <input
              value={autoRandomSeed}
              onChange={(e) => setAutoRandomSeed(e.target.value)}
              placeholder="Auto Random Seed (optional)"
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-gray-200 w-[220px]"
              title="Used by tiktok-repost auto selection (video/source) for reproducible debug reruns"
            />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={!manualTiktokRepostPickersEnabled}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-gray-200 max-w-[240px] disabled:opacity-50"
              title="Manual account picker (TikTok Repost debug cases only)"
            >
              <option value="auto">Debug Account: Auto Select</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.handle || (acc.username ? `@${acc.username}` : acc.id)}{acc.status ? ` · ${acc.status}` : ''}
                </option>
              ))}
            </select>
            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              disabled={!manualTiktokRepostPickersEnabled}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-gray-200 max-w-[360px] disabled:opacity-50"
              title="Optional manual video picker for TikTok Repost publish debug cases"
            >
              <option value="auto">Debug Video (TikTok Repost): Auto Select</option>
              {videoCandidates.map(v => {
                const fileName = (v.localPath || '').split(/[\\/]/).pop() || v.localPath
                const campaign = v.campaignName || v.campaignId.slice(0, 8)
                const status = v.status || 'unknown'
                const label = `${campaign} · ${status} · ${v.platformId} · ${fileName}`
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
              disabled={!manualTiktokRepostPickersEnabled}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-gray-200 max-w-[360px] disabled:opacity-50"
              title="Optional manual source picker (channel/keyword) for TikTok Repost scan debug cases"
            >
              <option value="auto">Debug Source (TikTok Repost): Auto Random</option>
              {sourceCandidates.map(s => {
                const campaign = s.campaignName || s.campaignId.slice(0, 8)
                const label = `${campaign} · ${s.sourceType}:${s.sourceName}${s.minViews ? ` · minViews=${s.minViews}` : ''}${s.minLikes ? ` · minLikes=${s.minLikes}` : ''}`
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
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-gray-200"
            >
              <option value="all">All Workflows</option>
              {workflowOptions.map(w => (
                <option key={w.workflowId} value={w.workflowId}>
                  {w.workflowId}
                </option>
              ))}
            </select>
            <select
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-gray-200"
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
              className="px-3 py-2 rounded-lg border border-gray-700 text-sm hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={runAll}
              disabled={
                loading ||
                filteredCases.filter(c => c.implemented !== false).length === 0 ||
                Object.values(busy).some(Boolean)
              }
              className="px-3 py-2 rounded-lg border border-amber-600/40 text-amber-300 text-sm hover:bg-amber-500/10 transition disabled:opacity-50"
            >
              Run Visible Cases
            </button>
            <button
              onClick={clearRuns}
              className="px-3 py-2 rounded-lg border border-red-700/50 text-red-300 text-sm hover:bg-red-500/10 transition"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {message && (
          <div className={`rounded-lg border text-sm px-3 py-2 ${
            messageTone === 'info'
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {message}
            {sentryFeedback && (
              <div className="mt-2 space-y-1 text-xs">
                {sentryFeedback.message && (
                  <div className="text-gray-300">{sentryFeedback.message}</div>
                )}
                {!!sentryFeedback.eventId && (
                  <div>
                    eventId: <span className="font-mono text-gray-200">{sentryFeedback.eventId}</span>
                  </div>
                )}
                {(typeof sentryFeedback.attempts === 'number' || typeof sentryFeedback.elapsedMs === 'number') && (
                  <div className="text-gray-300">
                    attempts={sentryFeedback.attempts ?? 0}
                    {typeof sentryFeedback.elapsedMs === 'number' ? `, elapsed=${sentryFeedback.elapsedMs}ms` : ''}
                  </div>
                )}
                {sentryFeedback.lastError && (
                  <div className="text-amber-300">lastError: {sentryFeedback.lastError}</div>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {sentryFeedback.eventUrl && (
                    <a
                      href={sentryFeedback.eventUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-cyan-200 hover:text-cyan-100"
                    >
                      Open Sentry Event
                    </a>
                  )}
                  {sentryFeedback.issueSearchUrl && (
                    <a
                      href={sentryFeedback.issueSearchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-cyan-200 hover:text-cyan-100"
                    >
                      Open Sentry Issue Search
                    </a>
                  )}
                  {sentryFeedback.eventApiUrl && (
                    <button
                      onClick={() => navigator.clipboard?.writeText(sentryFeedback.eventApiUrl || '').catch(() => {})}
                      className="px-2 py-0.5 rounded border border-gray-700 text-[10px] text-gray-200 hover:border-gray-500"
                    >
                      Copy Event API URL
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {(autoRandomSeed.trim() || (manualTiktokRepostPickersEnabled && (selectedAccountId !== 'auto' || selectedVideoId !== 'auto' || selectedSourceId !== 'auto'))) && (
          <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 text-xs text-gray-400">
            {autoRandomSeed.trim() && (
              <div>Auto random seed (tiktok-repost): <span className="font-mono text-gray-300">{autoRandomSeed.trim()}</span></div>
            )}
            <div>
              Debug account: {selectedAccountId === 'auto'
                ? 'Auto Select'
                : (accounts.find(a => a.id === selectedAccountId)?.handle || accounts.find(a => a.id === selectedAccountId)?.username || selectedAccountId)}
            </div>
            <div className="truncate">
              Debug video (tiktok-repost): {selectedVideoCandidate
                ? `${selectedVideoCandidate.campaignName || selectedVideoCandidate.campaignId} · ${selectedVideoCandidate.platformId} · ${selectedVideoCandidate.localPath}`
                : 'Auto Select'}
            </div>
            <div className="truncate">
              Debug source (tiktok-repost): {selectedSourceCandidate
                ? `${selectedSourceCandidate.campaignName || selectedSourceCandidate.campaignId} · ${selectedSourceCandidate.sourceType}:${selectedSourceCandidate.sourceName}`
                : 'Auto Random'}
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Test Cases</p>
                <span className="text-xs text-gray-500">
                  {filteredCases.length}/{cases.length} cases
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mb-3">
                Filter: <span className="font-mono text-gray-300">{workflowFilter === 'all' ? 'all workflows' : workflowFilter}</span>
                {' · '}
                <span className="font-mono text-gray-300">{versionFilter === 'all' ? 'all versions' : `v${versionFilter}`}</span>
              </div>
              <div className="space-y-4">
                {groupedCases.map(suiteSection => (
                  <div key={suiteSection.suite} className="space-y-3">
                    <div
                      className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/20 px-3 py-2"
                      data-suite-heading={suiteSection.suite}
                    >
                      <p className="text-xs uppercase tracking-wider text-gray-400">
                        Suite: <span className="text-gray-200">{suiteSection.label}</span>
                      </p>
                      <span className="text-[11px] text-gray-500">{suiteSection.count} case(s)</span>
                    </div>
                    {suiteSection.groups.map(section => (
                      <div key={`${suiteSection.suite}-${section.group}`} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-wider text-gray-500">
                            Group: <span className="text-gray-200">{section.group}</span>
                          </p>
                          <span className="text-[11px] text-gray-500">{section.items.length} case(s)</span>
                        </div>
                        {section.items.map(c => {
                          const isRunning = !!busy[c.id] || runs.some(r => r.caseId === c.id && r.status === 'running')
                          const dbChecks = c.meta?.checks?.db?.length || 0
                          const uiChecks = c.meta?.checks?.ui?.length || 0
                          const logChecks = c.meta?.checks?.logs?.length || 0
                          return (
                            <div key={c.id} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold">{c.title}</p>
                                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                                      c.risk === 'real_publish'
                                        ? 'text-red-300 border-red-500/30 bg-red-500/10'
                                        : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                                    }`}>
                                      {c.risk === 'real_publish' ? 'Real Publish' : 'Safe'}
                                    </span>
                                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                                      c.implemented === false
                                        ? 'text-slate-300 border-slate-500/30 bg-slate-500/10'
                                        : 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'
                                    }`}>
                                      {c.implemented === false ? 'Planned' : 'Runnable'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">{c.description}</p>
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {(c.workflowId || c.workflowVersion) && (
                                      <span className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-300 bg-gray-900/70 font-mono">
                                        {c.workflowId || 'unscoped'}{c.workflowVersion ? `@v${c.workflowVersion}` : ''}
                                      </span>
                                    )}
                                    {c.category && (
                                      <span className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-300 bg-gray-900/70">
                                        {c.category}
                                      </span>
                                    )}
                                    {c.level && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                        c.level === 'basic'
                                          ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                                          : c.level === 'intermediate'
                                            ? 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                                            : 'border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10'
                                      }`}>
                                        {c.level}
                                      </span>
                                    )}
                                    {(c.tags || []).slice(0, 6).map(tag => (
                                      <span key={`${c.id}-${tag}`} className="text-[10px] px-2 py-0.5 rounded border border-gray-800 text-gray-400 bg-gray-950">
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="text-[11px] text-gray-500 mt-2 flex flex-wrap gap-3">
                                    <span>Params: {c.meta?.parameters?.length || 0}</span>
                                    <span>DB checks: {dbChecks}</span>
                                    <span>UI checks: {uiChecks}</span>
                                    <span>Log checks: {logChecks}</span>
                                  </div>
                                  <p className="text-[11px] text-gray-500 mt-2 font-mono">{c.id}</p>
                                  {c.fingerprint && (
                                    <p className="text-[11px] text-gray-600 mt-1 font-mono">fp={c.fingerprint}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => runCase(c.id)}
                                  disabled={isRunning || c.implemented === false}
                                  className="px-3 py-1.5 rounded-lg text-sm border border-cyan-600/40 text-cyan-300 hover:bg-cyan-500/10 transition disabled:opacity-50"
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
                  <div className="text-sm text-gray-500 py-6 text-center">No troubleshooting cases for this workflow/version.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Run History</p>
                <span className="text-xs text-gray-500">{filteredRuns.length}/{runs.length} runs</span>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredRuns.map(run => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                      selectedRunId === run.id
                        ? 'border-cyan-500/50 bg-cyan-500/5'
                        : 'border-gray-800 bg-gray-950/50 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{run.title}</p>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${statusChip[run.status] || statusChip.failed}`}>
                        {run.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {new Date(run.startedAt).toLocaleString('vi-VN')}
                    </p>
                    {(run.workflowId || run.workflowVersion) && (
                      <p className="text-[10px] text-gray-500 mt-1 font-mono">
                        {(run.workflowId || 'unscoped')}{run.workflowVersion ? `@v${run.workflowVersion}` : ''}
                        {run.category ? ` · ${run.category}` : ''}
                        {run.level ? ` · ${run.level}` : ''}
                      </p>
                    )}
                    {run.summary && <p className="text-xs text-gray-300 mt-1 line-clamp-2">{run.summary}</p>}
                  </button>
                ))}
                {filteredRuns.length === 0 && (
                  <div className="text-sm text-gray-500 py-6 text-center">No runs for this workflow/version.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Run Details</p>
                {selectedRun ? (
                  <p className="text-sm text-white mt-1">{selectedRun.title}</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">Select a run to inspect logs.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedRun && (
                  <>
                    <button
                      onClick={() => setFullLogOpen(true)}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-200 hover:border-gray-500"
                    >
                      View Full Log
                    </button>
                    {selectedRun.status === 'failed' && (
                      <button
                        onClick={sendSelectedRunToSentry}
                        disabled={sendingSentry}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-600/40 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
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
                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Summary</p>
                  <p className="text-sm text-gray-200">{selectedRun.summary || '(no summary yet)'}</p>
                  <div className="text-xs text-gray-500 mt-2 space-y-1">
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
                        {selectedRun.category ? ` · ${selectedRun.category}` : ''}
                        {selectedRun.group ? ` · group:${selectedRun.group}` : ''}
                        {selectedRun.level ? ` · ${selectedRun.level}` : ''}
                      </div>
                    )}
                    {selectedRun.tags && selectedRun.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedRun.tags.map(tag => (
                          <span key={`${selectedRun.id}-${tag}`} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400">
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

                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Case Meta</p>
                  {selectedRun.caseMeta ? (
                    <div className="space-y-3 text-xs text-gray-300">
                      {(selectedRun.caseMeta.parameters || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Parameters</p>
                          <div className="space-y-1">
                            {(selectedRun.caseMeta.parameters || []).map((p, idx) => (
                              <div key={`${selectedRun.id}-param-${idx}`} className="rounded border border-gray-800 bg-black/20 px-2 py-1">
                                <span className="font-mono text-cyan-300">{p.key}</span>
                                {p.value !== undefined && <span className="text-gray-400"> = {String(p.value)}</span>}
                                {p.required && <span className="text-red-300"> (required)</span>}
                                {p.description && <span className="text-gray-500"> · {p.description}</span>}
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
                              <div key={`${selectedRun.id}-checks-${section}`} className="rounded border border-gray-800 bg-black/20 p-2">
                                <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">{section} checks</p>
                                <ul className="list-disc list-inside space-y-1 text-gray-300">
                                  {items.map((item, idx) => <li key={`${section}-${idx}`}>{item}</li>)}
                                </ul>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {(selectedRun.caseMeta.artifacts || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Artifact Plan</p>
                          <div className="space-y-1">
                            {(selectedRun.caseMeta.artifacts || []).map((artifact, idx) => (
                              <div key={`${selectedRun.id}-artifact-plan-${idx}`} className="rounded border border-gray-800 bg-black/20 px-2 py-1">
                                <span className="font-mono text-violet-300">{artifact.key}</span>
                                <span className="text-gray-400"> · {artifact.type}</span>
                                {artifact.when && <span className="text-gray-500"> · when={artifact.when}</span>}
                                {artifact.required && <span className="text-amber-300"> · required</span>}
                                {artifact.description && <span className="text-gray-500"> · {artifact.description}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(selectedRun.caseMeta.passMessages || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Pass Criteria / Messages</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-300">
                            {(selectedRun.caseMeta.passMessages || []).map((m, idx) => <li key={`pass-${idx}`}>{m}</li>)}
                          </ul>
                        </div>
                      )}

                      {(selectedRun.caseMeta.errorMessages || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Error Expectations</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-300">
                            {(selectedRun.caseMeta.errorMessages || []).map((m, idx) => <li key={`err-${idx}`}>{m}</li>)}
                          </ul>
                        </div>
                      )}

                      {(selectedRun.caseMeta.notes || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">Notes</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-300">
                            {(selectedRun.caseMeta.notes || []).map((m, idx) => <li key={`note-${idx}`}>{m}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No case metadata snapshot.</div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Artifacts</p>
                  {selectedRunArtifacts.length > 0 ? (
                    <div className="space-y-2">
                      {selectedRunArtifacts.map(({ key, textValue, preview, mode, imageSrc }) => {
                        return (
                          <div key={`${selectedRun.id}-artifact-${key}`} className="rounded border border-gray-800 bg-black/20 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-cyan-300">{key}</span>
                              <button
                                onClick={() => navigator.clipboard?.writeText(textValue).catch(() => {})}
                                className="px-2 py-0.5 rounded border border-gray-700 text-[10px] text-gray-200 hover:border-gray-500"
                              >
                                Copy
                              </button>
                            </div>
                            {mode === 'image' && imageSrc ? (
                              <div className="mt-2 rounded border border-gray-800 bg-black/30 overflow-hidden">
                                <img
                                  src={imageSrc}
                                  alt={`Screenshot artifact: ${key}`}
                                  data-artifact-kind="image"
                                  className="w-full max-h-[260px] object-contain bg-black"
                                />
                              </div>
                            ) : (
                              <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-words mt-1">{preview}</pre>
                            )}
                            {mode === 'image' && (
                              <p className="text-[11px] text-gray-500 break-all mt-2">{preview}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No artifact outputs recorded for this run.</div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500">AI Debug Footprint</p>
                    <button
                      onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRun.diagnosticFootprint || {}, null, 2)).catch(() => {})}
                      className="px-2 py-1 rounded border border-gray-700 text-[10px] text-gray-200 hover:border-gray-500"
                    >
                      Copy Footprint JSON
                    </button>
                  </div>
                  {selectedRun.diagnosticFootprint ? (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-400">
                        schema={selectedRun.diagnosticFootprint?.schemaVersion || 1}
                        {selectedRun.diagnosticFootprint?.execution?.durationMs !== undefined && (
                          <span> · duration={selectedRun.diagnosticFootprint.execution.durationMs}ms</span>
                        )}
                        {selectedRun.diagnosticFootprint?.signals && (
                          <span>
                            {' '}· errors={selectedRun.diagnosticFootprint.signals.errorCount}
                            {' '}warns={selectedRun.diagnosticFootprint.signals.warnCount}
                          </span>
                        )}
                      </div>
                      {selectedRun.footprintPath && (
                        <div className="text-[11px] text-gray-500 break-all">
                          footprint_file={selectedRun.footprintPath}
                        </div>
                      )}
                      <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
                        {selectedRunFootprintPreview}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">
                      No diagnostic footprint yet (generated on case completion/failure).
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Result Payload</p>
                  <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto">
                    {JSON.stringify(selectedRun.result || {}, null, 2)}
                  </pre>
                </div>

                <div className="rounded-lg border border-gray-800 bg-black/40 p-3 flex-1 min-h-0">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Logs ({selectedRun.logs?.length || 0})</p>
                  {selectedRun.logStats && selectedRun.logStats.total > (selectedRun.logs?.length || 0) && (
                    <p className="text-[10px] text-amber-300 mb-2">
                      Showing last {selectedRun.logs?.length || 0}/{selectedRun.logStats.total} log lines (history capped).
                    </p>
                  )}
                  <div className="font-mono text-[11px] space-y-1 max-h-[360px] overflow-y-auto pr-1">
                    {(selectedRun.logs || []).map((entry, idx) => (
                      <div key={`${entry.ts}-${idx}`} className="rounded px-2 py-1 hover:bg-white/5">
                        <span className="text-gray-600 mr-2">
                          {new Date(entry.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className={`mr-2 uppercase ${levelColor[entry.level] || levelColor.info}`}>{entry.level}</span>
                        <span className="text-gray-200 break-words">{entry.line}</span>
                      </div>
                    ))}
                    {(selectedRun.logs || []).length === 0 && (
                      <div className="text-gray-500">No logs recorded.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 grid place-items-center text-sm text-gray-500">
                No run selected.
              </div>
            )}
          </div>
        </div>
      </div>

      {fullLogOpen && selectedRun && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4">
          <div className="max-w-6xl mx-auto h-full rounded-xl border border-gray-700 bg-gray-950 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800">
              <div>
                <p className="text-sm font-semibold text-white">Full Run Log</p>
                <p className="text-xs text-gray-400 font-mono">{selectedRun.caseId} · {selectedRun.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRun, null, 2)).catch(() => {})}
                  className="px-2.5 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-200 hover:border-gray-500"
                >
                  Copy Run JSON
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRun.diagnosticFootprint || {}, null, 2)).catch(() => {})}
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-700/40 text-xs text-cyan-200 hover:border-cyan-500"
                >
                  Copy Footprint
                </button>
                <button
                  onClick={() => setFullLogOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-red-700/50 text-xs text-red-300 hover:bg-red-500/10"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-3 p-4 min-h-0 flex-1">
              <div className="rounded-lg border border-gray-800 bg-black/30 p-3 min-h-0 flex flex-col">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
                  Full Timeline Logs ({selectedRun.logs?.length || 0}{selectedRun.logStats ? `/${selectedRun.logStats.total}` : ''})
                </p>
                <div className="font-mono text-[11px] space-y-1 overflow-y-auto pr-1 min-h-0">
                  {(selectedRun.logs || []).map((entry, idx) => (
                    <div key={`full-${entry.ts}-${idx}`} className="rounded px-2 py-1 hover:bg-white/5">
                      <span className="text-gray-600 mr-2">
                        {new Date(entry.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`mr-2 uppercase ${levelColor[entry.level] || levelColor.info}`}>{entry.level}</span>
                      <span className="text-gray-200 break-words">{entry.line}</span>
                    </div>
                  ))}
                  {(selectedRun.logs || []).length === 0 && (
                    <div className="text-gray-500">No logs recorded.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 min-h-0 flex flex-col">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Run Snapshot</p>
                <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words overflow-y-auto min-h-0">
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

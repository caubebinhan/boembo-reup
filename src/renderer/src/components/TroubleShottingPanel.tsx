import { useEffect, useMemo, useState } from 'react'

type TroubleCase = {
  id: string
  title: string
  description: string
  risk: 'safe' | 'real_publish'
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
  logs: TroubleLogEntry[]
  result?: any
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

  const selectedRun = useMemo(
    () => runs.find(r => r.id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId]
  )

  const load = async () => {
    setLoading(true)
    try {
      const [caseList, runList] = await Promise.all([
        api.invoke('troubleshooting:list-cases'),
        api.invoke('troubleshooting:list-runs', { limit: 50 }),
      ])
      setCases(Array.isArray(caseList) ? caseList : [])
      setRuns(Array.isArray(runList) ? runList : [])
      setSelectedRunId((prev: string | null) => prev || (Array.isArray(runList) && runList[0]?.id) || null)
    } catch (err: any) {
      console.error('[TroubleShottingPanel] load failed', err)
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
          ? { ...run, logs: [...(run.logs || []), payload.entry].slice(-1000) }
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

    return () => {
      if (typeof offLog === 'function') offLog()
      if (typeof offUpdate === 'function') offUpdate()
    }
  }, [])

  const runCase = async (caseId: string) => {
    setBusy(prev => ({ ...prev, [caseId]: true }))
    setMessage('')
    try {
      const run = await api.invoke('troubleshooting:run-case', { caseId })
      if (run?.id) setSelectedRunId(run.id)
      if (run?.status && run.status !== 'running') {
        setBusy(prev => ({ ...prev, [caseId]: false }))
      }
    } catch (err: any) {
      console.error('[TroubleShottingPanel] runCase failed', err)
      setBusy(prev => ({ ...prev, [caseId]: false }))
      setMessage(`Run failed: ${err?.message || String(err)}`)
    }
  }

  const runAll = async () => {
    for (const c of cases) {
      // eslint-disable-next-line no-await-in-loop
      await runCase(c.id)
    }
  }

  const clearRuns = async () => {
    try {
      await api.invoke('troubleshooting:clear-runs')
      setRuns([])
      setSelectedRunId(null)
    } catch (err: any) {
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
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-gray-700 text-sm hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={runAll}
              disabled={loading || cases.length === 0 || Object.values(busy).some(Boolean)}
              className="px-3 py-2 rounded-lg border border-amber-600/40 text-amber-300 text-sm hover:bg-amber-500/10 transition disabled:opacity-50"
            >
              Run All Cases
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
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
            {message}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Test Cases</p>
                <span className="text-xs text-gray-500">{cases.length} cases</span>
              </div>
              <div className="space-y-3">
                {cases.map(c => {
                  const isRunning = !!busy[c.id] || runs.some(r => r.caseId === c.id && r.status === 'running')
                  return (
                    <div key={c.id} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{c.title}</p>
                            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                              c.risk === 'real_publish'
                                ? 'text-red-300 border-red-500/30 bg-red-500/10'
                                : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                            }`}>
                              {c.risk === 'real_publish' ? 'Real Publish' : 'Safe'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{c.description}</p>
                          <p className="text-[11px] text-gray-500 mt-2 font-mono">{c.id}</p>
                        </div>
                        <button
                          onClick={() => runCase(c.id)}
                          disabled={isRunning}
                          className="px-3 py-1.5 rounded-lg text-sm border border-cyan-600/40 text-cyan-300 hover:bg-cyan-500/10 transition disabled:opacity-50"
                        >
                          {isRunning ? 'Running...' : 'Run'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                {cases.length === 0 && (
                  <div className="text-sm text-gray-500 py-6 text-center">No troubleshooting cases available.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Run History</p>
                <span className="text-xs text-gray-500">{runs.length} runs</span>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {runs.map(run => (
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
                    {run.summary && <p className="text-xs text-gray-300 mt-1 line-clamp-2">{run.summary}</p>}
                  </button>
                ))}
                {runs.length === 0 && (
                  <div className="text-sm text-gray-500 py-6 text-center">No runs yet.</div>
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
              {selectedRun && (
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${statusChip[selectedRun.status] || statusChip.failed}`}>
                  {selectedRun.status}
                </span>
              )}
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
                  </div>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Result Payload</p>
                  <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto">
                    {JSON.stringify(selectedRun.result || {}, null, 2)}
                  </pre>
                </div>

                <div className="rounded-lg border border-gray-800 bg-black/40 p-3 flex-1 min-h-0">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Logs ({selectedRun.logs?.length || 0})</p>
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
    </div>
  )
}


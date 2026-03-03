/**
 * RunHistoryList — Scrollable list of past run records.
 * Shows status, title, error code, and timestamp.
 */
import type { TroubleRun } from './useDebugState'
import { STATUS_CHIP } from './useDebugState'

interface Props {
    runs: TroubleRun[]
    selectedRunId: string | null
    onSelectRun: (runId: string) => void
}

export function RunHistoryList({ runs, selectedRunId, onSelectRun }: Props) {
    if (runs.length === 0) {
        return (
            <div className="rounded-xl border border-vintage-border bg-vintage-cream/20 p-4">
                <p className="text-[11px] uppercase tracking-wider text-vintage-gray mb-2">Run History</p>
                <p className="text-sm text-vintage-gray">No runs yet. Run a case to see results here.</p>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-vintage-border bg-vintage-cream/20 overflow-hidden">
            <div className="px-4 py-2 bg-vintage-cream/60 border-b border-vintage-border flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-vintage-gray">Run History</span>
                <span className="text-[10px] text-vintage-gray">{runs.length} run(s)</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto divide-y divide-vintage-border/30">
                {runs.map(run => {
                    const isSelected = run.id === selectedRunId
                    const elapsed = run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : '...'

                    return (
                        <button
                            key={run.id}
                            onClick={() => onSelectRun(run.id)}
                            className={`w-full text-left px-4 py-2.5 transition hover:bg-vintage-cream/60 ${isSelected ? 'bg-sky-50/60 border-l-2 border-l-sky-400' : ''
                                }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Status dot */}
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${run.status === 'passed' ? 'bg-emerald-400'
                                            : run.status === 'failed' ? 'bg-rose-400'
                                                : 'bg-sky-400 animate-pulse'
                                        }`} />
                                    <span className="text-sm text-vintage-charcoal truncate">{run.title}</span>
                                    {run.errorCode && (
                                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-vintage-border/50 text-vintage-gray flex-shrink-0">
                                            {run.errorCode}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[10px] text-vintage-gray tabular-nums">{elapsed}</span>
                                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_CHIP[run.status] || ''}`}>
                                        {run.status}
                                    </span>
                                </div>
                            </div>
                            {run.summary && (
                                <p className="text-[11px] text-vintage-gray truncate mt-0.5 ml-4">{run.summary}</p>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

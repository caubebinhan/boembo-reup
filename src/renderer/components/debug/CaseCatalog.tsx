/**
 * CaseCatalog — Grouped case list with run/filter controls.
 * Shows cases organized by suite → group with status badges.
 */
import type { TroubleCaseSuiteSection } from './helpers'
import type { TroubleCase, TroubleRun } from './useDebugState'
import { STATUS_CHIP } from './useDebugState'

interface Props {
    groupedCases: TroubleCaseSuiteSection<TroubleCase>[]
    filteredRuns: TroubleRun[]
    busy: Record<string, boolean>
    onRunCase: (caseId: string) => void
    onSelectRun: (runId: string) => void
}

export function CaseCatalog({ groupedCases, filteredRuns, busy, onRunCase, onSelectRun }: Props) {
    // Build latest run status per caseId
    const latestRunByCaseId = new Map<string, TroubleRun>()
    for (const run of filteredRuns) {
        if (!latestRunByCaseId.has(run.caseId)) latestRunByCaseId.set(run.caseId, run)
    }

    if (groupedCases.length === 0) {
        return <p className="text-sm text-vintage-gray py-4">No cases match current filters.</p>
    }

    return (
        <div className="space-y-4">
            {groupedCases.map(suite => (
                <div key={suite.suite} className="rounded-xl border border-vintage-border bg-vintage-cream/20 overflow-hidden">
                    <div className="px-4 py-2 bg-vintage-cream/60 border-b border-vintage-border flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-vintage-gray">{suite.label}</span>
                        <span className="text-[10px] text-vintage-gray">{suite.count} case(s)</span>
                    </div>

                    <div className="divide-y divide-vintage-border/50">
                        {suite.groups.map(group => (
                            <div key={group.group} className="px-4 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-vintage-gray mb-2">{group.group}</p>
                                <div className="space-y-1">
                                    {group.items.map(c => {
                                        const latestRun = latestRunByCaseId.get(c.id)
                                        const isBusy = busy[c.id]
                                        const isNotImplemented = c.implemented === false

                                        return (
                                            <div
                                                key={c.id}
                                                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-vintage-cream/60 transition group"
                                            >
                                                {/* Status dot */}
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${latestRun?.status === 'passed' ? 'bg-emerald-400'
                                                        : latestRun?.status === 'failed' ? 'bg-rose-400'
                                                            : latestRun?.status === 'running' ? 'bg-sky-400 animate-pulse'
                                                                : 'bg-vintage-border'
                                                    }`} />

                                                {/* Title + error code */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-vintage-charcoal truncate">{c.title}</span>
                                                        {c.errorCode && (
                                                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-vintage-border/50 text-vintage-gray flex-shrink-0">
                                                                {c.errorCode}
                                                            </span>
                                                        )}
                                                        {isNotImplemented && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0">
                                                                planned
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-vintage-gray truncate">{c.description}</p>
                                                </div>

                                                {/* Latest run status chip */}
                                                {latestRun && (
                                                    <button
                                                        onClick={() => onSelectRun(latestRun.id)}
                                                        className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${STATUS_CHIP[latestRun.status] || ''}`}
                                                    >
                                                        {latestRun.status}
                                                    </button>
                                                )}

                                                {/* Run button */}
                                                <button
                                                    onClick={() => onRunCase(c.id)}
                                                    disabled={isBusy || isNotImplemented}
                                                    className="text-xs px-2.5 py-1 rounded border border-vintage-border bg-vintage-white text-vintage-charcoal hover:border-sky-300 hover:bg-sky-50 transition disabled:opacity-30 flex-shrink-0 opacity-0 group-hover:opacity-100"
                                                >
                                                    {isBusy ? '...' : 'Run'}
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

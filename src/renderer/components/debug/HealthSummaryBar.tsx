/**
 * HealthSummaryBar — At-a-glance system health strip.
 * Shows pass/fail/running counts and an overall health percentage.
 */
import type { HealthSummary, RunAllProgress, RunAllSummary } from './useDebugState'

interface Props {
    health: HealthSummary
    runAllProgress: RunAllProgress
    runAllSummary?: RunAllSummary | null
    currentCaseTitle?: string
}

export function HealthSummaryBar({ health, runAllProgress, runAllSummary, currentCaseTitle }: Props) {
    const { totalCases, runnableCases, totalRuns, passedRuns, failedRuns, runningCount, healthPercent } = health

    // Color based on health
    const healthColor =
        healthPercent < 0 ? 'text-vintage-gray'
            : healthPercent >= 80 ? 'text-emerald-600'
                : healthPercent >= 50 ? 'text-amber-600'
                    : 'text-rose-600'

    const barColor =
        healthPercent < 0 ? 'bg-vintage-gray/30'
            : healthPercent >= 80 ? 'bg-emerald-400'
                : healthPercent >= 50 ? 'bg-amber-400'
                    : 'bg-rose-400'

    return (
        <div className="rounded-xl border border-vintage-border bg-gradient-to-r from-vintage-cream/50 to-vintage-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-6">
                {/* Health meter */}
                <div className="flex items-center gap-4 min-w-0">
                    <div className="flex flex-col items-center">
                        <span className={`text-3xl font-bold tabular-nums ${healthColor}`}>
                            {healthPercent >= 0 ? `${healthPercent}%` : '—'}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-vintage-gray">Health</span>
                    </div>

                    {/* Mini bar */}
                    <div className="w-24 h-3 rounded-full bg-vintage-border/50 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${Math.max(healthPercent, 0)}%` }}
                        />
                    </div>
                </div>

                {/* Stats chips */}
                <div className="flex items-center gap-3 flex-wrap">
                    <Chip label="Cases" value={`${runnableCases}/${totalCases}`} color="text-vintage-charcoal" />
                    <Chip label="Runs" value={totalRuns} color="text-sky-700" />
                    <Chip label="Passed" value={passedRuns} color="text-emerald-700" />
                    <Chip label="Failed" value={failedRuns} color="text-rose-700" />
                    {runningCount > 0 && <Chip label="Running" value={runningCount} color="text-sky-600" pulse />}
                </div>
            </div>

            {/* Run-all progress bar */}
            {runAllProgress.active && (
                <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-sky-700 mb-1">
                        <span className="font-semibold">Run All progress</span>
                        <span className="tabular-nums">
                            {Math.min(runAllProgress.done, runAllProgress.total)}/{runAllProgress.total}
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-sky-100 overflow-hidden">
                        <div
                            className="h-full bg-sky-500 transition-all duration-300"
                            style={{ width: `${runAllProgress.total > 0 ? (Math.min(runAllProgress.done, runAllProgress.total) / runAllProgress.total) * 100 : 0}%` }}
                        />
                    </div>
                    {currentCaseTitle && (
                        <div className="text-[11px] text-sky-600 mt-1 truncate">
                            Running: <span className="font-mono">{currentCaseTitle}</span>
                        </div>
                    )}
                </div>
            )}

            {!runAllProgress.active && runAllSummary && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                    runAllSummary.failed > 0
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                    <div className="font-semibold">
                        Run All completed: passed {runAllSummary.passed}/{runAllSummary.total}, failed {runAllSummary.failed}.
                    </div>
                    {runAllSummary.failed > 0 && (
                        <div className="mt-1 break-words">
                            Failed case(s): <span className="font-mono">{runAllSummary.failedCaseCodes.join(', ')}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function Chip({ label, value, color, pulse }: { label: string; value: string | number; color: string; pulse?: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-vintage-border bg-vintage-white text-xs ${color}`}>
            {pulse && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />}
            <span className="text-vintage-gray">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
        </div>
    )
}

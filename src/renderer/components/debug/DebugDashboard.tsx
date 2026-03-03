/**
 * DebugDashboard — Thin compositor for the Debug/Troubleshooting tab.
 * ────────────────────────────────────────────────────────────────────
 * Uses useDebugState hook for all state management.
 */
import { useDebugState } from './useDebugState'
import { HealthSummaryBar } from './HealthSummaryBar'
import { CaseCatalog } from './CaseCatalog'
import { RunHistoryList } from './RunHistoryList'
import { RunDetailPanel } from './RunDetailPanel'

export function DebugDashboard() {
    const state = useDebugState()

    return (
        <div className="flex-1 overflow-y-auto bg-vintage-white p-6 h-full text-vintage-charcoal">
            <div className="max-w-[1500px] mx-auto space-y-5">

                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">System Diagnostics</h1>
                        <p className="text-sm text-vintage-gray mt-1">
                            Run health checks & test cases. Visualize system status and trace issues.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Workflow filter */}
                        <select
                            value={state.workflowFilter}
                            onChange={e => state.setWorkflowFilter(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal"
                        >
                            <option value="all">All Workflows</option>
                            {state.workflowOptions.map(w => (
                                <option key={w.workflowId} value={w.workflowId}>
                                    {w.workflowId} ({w.runnableCases}/{w.totalCases})
                                </option>
                            ))}
                        </select>
                        <select
                            value={state.versionFilter}
                            onChange={e => state.setVersionFilter(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal"
                        >
                            <option value="all">All Versions</option>
                            {state.versionOptions.map(v => (
                                <option key={v} value={v}>v{v}</option>
                            ))}
                        </select>
                        <button
                            onClick={state.load}
                            disabled={state.loading}
                            className="px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-sm text-vintage-charcoal hover:border-pastel-blue hover:bg-pastel-blue/20 transition disabled:opacity-50"
                        >
                            {state.loading ? 'Loading...' : 'Refresh'}
                        </button>
                        <button
                            onClick={state.runAll}
                            disabled={state.loading || state.runAllProgress.active || state.filteredCases.filter(c => c.implemented !== false).length === 0}
                            className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm hover:bg-amber-100 transition disabled:opacity-50"
                        >
                            Run All
                        </button>
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-vintage-border bg-vintage-white text-xs text-vintage-charcoal cursor-pointer">
                            <input
                                type="checkbox"
                                checked={state.autoSentryEnabled}
                                onChange={e => state.setAutoSentryEnabled(e.target.checked)}
                                className="accent-rose-500"
                            />
                            <span>Auto Sentry</span>
                            {state.sentryReporterStats.recentCount > 0 && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 tabular-nums">
                                    {state.sentryReporterStats.recentCount}/{state.sentryReporterStats.maxPerWindow}
                                </span>
                            )}
                        </label>
                        <button
                            onClick={state.clearRuns}
                            className="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm hover:bg-rose-100 transition"
                        >
                            Clear Logs
                        </button>
                    </div>
                </div>

                {/* Health summary bar */}
                <HealthSummaryBar
                    health={state.healthSummary}
                    runAllProgress={state.runAllProgress}
                    runAllSummary={state.runAllSummary}
                    currentCaseTitle={state.runAllProgress.currentCaseId ? state.caseMap.get(state.runAllProgress.currentCaseId)?.title : undefined}
                />

                {/* Message banner */}
                {state.message && (
                    <div className={`rounded-lg border text-sm px-3 py-2 ${state.messageTone === 'info'
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}>
                        {state.message}
                    </div>
                )}

                {/* Auto-Sentry feedback toast */}
                {state.lastAutoSentryResult && (
                    <div className={`rounded-lg border text-xs px-3 py-2 flex items-center gap-2 ${state.lastAutoSentryResult.sent
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : state.lastAutoSentryResult.skipReason === 'disabled'
                                ? 'border-vintage-border bg-vintage-cream/30 text-vintage-gray'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}>
                        <span className="font-mono">{state.lastAutoSentryResult.errorCode || '—'}</span>
                        <span>{state.lastAutoSentryResult.message}</span>
                        {state.lastAutoSentryResult.eventId && (
                            <span className="font-mono text-[10px] text-vintage-gray">id: {state.lastAutoSentryResult.eventId}</span>
                        )}
                    </div>
                )}

                {/* Main 2-column layout */}
                <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                    {/* Left: Case catalog + run history */}
                    <div className="space-y-5">
                        <CaseCatalog
                            groupedCases={state.groupedCases}
                            filteredRuns={state.filteredRuns}
                            busy={state.busy}
                            onRunCase={state.runCase}
                            onSelectRun={state.setSelectedRunId}
                        />
                        <RunHistoryList
                            runs={state.filteredRuns}
                            selectedRunId={state.selectedRunId}
                            onSelectRun={state.setSelectedRunId}
                        />
                    </div>

                    {/* Right: Run detail */}
                    <RunDetailPanel
                        run={state.selectedRun}
                        caseDef={state.selectedCaseDef}
                        sentryFeedback={state.sentryFeedback}
                        sendingSentry={state.sendingSentry}
                        onSendSentry={state.sendSelectedRunToSentry}
                    />
                </div>
            </div>
        </div>
    )
}

/**
 * RunDetailPanel — Selected run detail view with logs, artifacts, footprint.
 * Shows run outcome, error code, Sentry link, and debug data.
 */
import { useState } from 'react'
import type { TroubleRun, TroubleCase, TroubleSentryFeedback } from './useDebugState'
import { STATUS_CHIP, parseRunMessages } from './useDebugState'
import { mapArtifactsForView } from '../TroubleshootingPanel.helpers'

const LOG_LEVEL_COLOR: Record<string, string> = {
    info: 'text-slate-600',
    warn: 'text-amber-700',
    error: 'text-rose-700',
}

interface Props {
    run: TroubleRun | null
    caseDef: TroubleCase | null
    sentryFeedback: TroubleSentryFeedback | null
    sendingSentry: boolean
    onSendSentry: () => void
}

export function RunDetailPanel({ run, caseDef: _caseDef, sentryFeedback, sendingSentry, onSendSentry }: Props) {
    const [showFullLog, setShowFullLog] = useState(false)

    if (!run) {
        return (
            <div className="rounded-xl border border-vintage-border bg-vintage-cream/20 p-6 text-center">
                <p className="text-sm text-vintage-gray">Select a run from the history list to view details.</p>
            </div>
        )
    }

    const { passedMessages, failReasons } = parseRunMessages(run)
    const artifacts = mapArtifactsForView(run.result?.artifacts, run.caseMeta?.artifacts)
    const errorTail = run.logs.filter(e => e.level === 'error').slice(-4)
    const footprintPreview = run.diagnosticFootprint
        ? JSON.stringify(run.diagnosticFootprint, null, 2).slice(0, 2200)
        : ''

    return (
        <div className="rounded-xl border border-vintage-border bg-vintage-cream/20 p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-vintage-charcoal">{run.title}</h3>
                    <p className="text-[11px] text-vintage-gray font-mono">{run.caseId}</p>
                    {run.errorCode && (
                        <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-vintage-border/50 text-vintage-charcoal">
                            {run.errorCode}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${STATUS_CHIP[run.status] || ''}`}>
                        {run.status}
                    </span>
                    <button
                        onClick={onSendSentry}
                        disabled={sendingSentry || run.status !== 'failed'}
                        className="text-xs px-2.5 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-30"
                    >
                        {sendingSentry ? 'Sending...' : 'Send to Sentry'}
                    </button>
                </div>
            </div>

            {/* Summary */}
            {run.summary && (
                <p className="text-sm text-vintage-charcoal bg-vintage-white rounded-lg border border-vintage-border px-3 py-2">
                    {run.summary}
                </p>
            )}

            {/* Pass/fail messages */}
            {run.status === 'passed' && passedMessages.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Passed</p>
                    <ul className="list-disc list-inside text-xs text-vintage-gray space-y-1">
                        {passedMessages.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                </div>
            )}
            {run.status === 'failed' && failReasons.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-rose-700 mb-1">✗ Failed</p>
                    <ul className="list-disc list-inside text-xs text-vintage-gray space-y-1">
                        {failReasons.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                </div>
            )}

            {/* Error tail */}
            {errorTail.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-rose-600 mb-1">Last Errors</p>
                    <div className="rounded-lg bg-rose-50/50 border border-rose-100 p-2 space-y-0.5 font-mono text-[11px]">
                        {errorTail.map((e, i) => (
                            <div key={i} className="text-rose-700 break-words">{e.line}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Artifacts */}
            {artifacts.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-vintage-charcoal mb-1">Artifacts</p>
                    <div className="flex flex-wrap gap-2">
                        {artifacts.map((a, i) => (
                            <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-vintage-border bg-vintage-white text-xs text-vintage-charcoal">
                                <span className="text-[10px] px-1 rounded bg-sky-50 text-sky-700">{a.typeHint || 'data'}</span>
                                <span className="truncate max-w-[200px]">{a.key}</span>
                                {a.textValue && (
                                    <button
                                        onClick={() => navigator.clipboard?.writeText(a.textValue || '')}
                                        className="text-[9px] text-vintage-gray hover:text-vintage-charcoal"
                                        title="Copy value"
                                    >
                                        📋
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Log viewer */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-vintage-charcoal">
                        Logs ({run.logs.length})
                        {run.logStats && (
                            <span className="font-normal text-vintage-gray">
                                {' '}— info={run.logStats.info}  warn={run.logStats.warn}  error={run.logStats.error}
                            </span>
                        )}
                    </p>
                    <button
                        onClick={() => setShowFullLog(prev => !prev)}
                        className="text-[10px] text-sky-700 hover:underline"
                    >
                        {showFullLog ? 'Collapse' : 'Expand All'}
                    </button>
                </div>
                <div className={`rounded-lg bg-vintage-white border border-vintage-border p-2 font-mono text-[11px] overflow-y-auto ${showFullLog ? 'max-h-[600px]' : 'max-h-[200px]'}`}>
                    {(showFullLog ? run.logs : run.logs.slice(-20)).map((entry, idx) => (
                        <div key={idx} className={`break-words ${LOG_LEVEL_COLOR[entry.level] || ''}`}>
                            <span className="text-vintage-gray/50 mr-1">{new Date(entry.ts).toLocaleTimeString()}</span>
                            <span className={`mr-1 ${entry.level !== 'info' ? 'font-semibold' : ''}`}>[{entry.level}]</span>
                            {entry.line}
                        </div>
                    ))}
                    {run.logs.length === 0 && <span className="text-vintage-gray">No logs recorded.</span>}
                </div>
            </div>

            {/* Sentry feedback */}
            {sentryFeedback && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs space-y-1">
                    {sentryFeedback.message && <p className="text-sky-700">{sentryFeedback.message}</p>}
                    {sentryFeedback.eventId && (
                        <p className="font-mono text-vintage-charcoal">eventId: {sentryFeedback.eventId}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {sentryFeedback.eventUrl && (
                            <a href={sentryFeedback.eventUrl} target="_blank" rel="noreferrer" className="underline text-sky-700 hover:text-sky-800">
                                Open Event
                            </a>
                        )}
                        {sentryFeedback.issueSearchUrl && (
                            <a href={sentryFeedback.issueSearchUrl} target="_blank" rel="noreferrer" className="underline text-sky-700 hover:text-sky-800">
                                Search Issues
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* Footprint preview */}
            {footprintPreview && (
                <details className="text-xs">
                    <summary className="cursor-pointer text-vintage-gray hover:text-vintage-charcoal">
                        Diagnostic Footprint
                    </summary>
                    <pre className="mt-1 rounded-lg bg-vintage-white border border-vintage-border p-2 font-mono text-[10px] overflow-x-auto max-h-[300px] overflow-y-auto">
                        {footprintPreview}
                    </pre>
                </details>
            )}
        </div>
    )
}

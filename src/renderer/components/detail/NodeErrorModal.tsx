/**
 * Node Execution Error Modal
 * ──────────────────────────
 * Premium modal shown when a pipeline node encounters an error.
 * Displays: error code, cause, solutions, and actionable buttons
 * (Retry, Skip, Troubleshoot).
 *
 * Designed for non-technical users — clear Vietnamese language,
 * visual severity indicators, and one-click resolution actions.
 */
import { useState } from 'react'
import type { ErrorResolution } from '@core/troubleshooting/errorResolution'

export interface NodeErrorModalProps {
    /** Whether modal is visible */
    open: boolean
    /** Error resolution data */
    resolution: ErrorResolution
    /** Raw error message from the system */
    rawError: string
    /** Node display name */
    nodeName: string
    /** Node icon */
    nodeIcon: string
    /** Campaign ID for IPC calls */
    campaignId: string
    /** Instance ID for retry/skip */
    instanceId: string
    /** Close modal */
    onClose: () => void
    /** Called after retry is initiated */
    onRetry?: () => void
    /** Called after skip is initiated */
    onSkip?: () => void
}

const SEVERITY_CONFIG = {
    critical: {
        gradient: 'linear-gradient(135deg, #dc2626, #991b1b)',
        bg: '#fef2f2',
        border: '#fca5a5',
        badge: 'bg-red-100 text-red-700 border-red-300',
        pulseColor: 'rgba(239, 68, 68, 0.15)',
        label: 'Nghiêm trọng',
        labelIcon: '🔴',
    },
    warning: {
        gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
        bg: '#fffbeb',
        border: '#fcd34d',
        badge: 'bg-amber-100 text-amber-700 border-amber-300',
        pulseColor: 'rgba(245, 158, 11, 0.15)',
        label: 'Cảnh báo',
        labelIcon: '🟡',
    },
    info: {
        gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        bg: '#eff6ff',
        border: '#93c5fd',
        badge: 'bg-blue-100 text-blue-700 border-blue-300',
        pulseColor: 'rgba(59, 130, 246, 0.15)',
        label: 'Thông tin',
        labelIcon: '🔵',
    },
}

export function NodeErrorModal({
    open, resolution, rawError, nodeName, nodeIcon,
    campaignId, instanceId, onClose, onRetry, onSkip,
}: NodeErrorModalProps) {
    const [retrying, setRetrying] = useState(false)
    const [skipping, setSkipping] = useState(false)
    const [troubleshooting, setTroubleshooting] = useState(false)
    const [troubleshootResult, setTroubleshootResult] = useState<any>(null)
    const [showRawError, setShowRawError] = useState(false)

    const api = (window as any).api
    const sev = SEVERITY_CONFIG[resolution.severity]

    if (!open) return null

    const handleRetry = async () => {
        setRetrying(true)
        try {
            await api.invoke('pipeline:retry-node', { campaignId, instanceId })
            onRetry?.()
            onClose()
        } catch (err: any) {
            console.error('[NodeErrorModal] Retry failed:', err)
        } finally {
            setRetrying(false)
        }
    }

    const handleSkip = async () => {
        setSkipping(true)
        try {
            await api.invoke('pipeline:skip-node', { campaignId, instanceId })
            onSkip?.()
            onClose()
        } catch (err: any) {
            console.error('[NodeErrorModal] Skip failed:', err)
        } finally {
            setSkipping(false)
        }
    }

    const handleTroubleshoot = async () => {
        setTroubleshooting(true)
        setTroubleshootResult(null)
        try {
            const handlerId = resolution.troubleshootHandler
            if (handlerId) {
                // Use per-error handler via new IPC
                const result = await api.invoke('troubleshooting:run-for-error', { handlerId })
                setTroubleshootResult(result)
            } else {
                // Fallback: generic network health check
                const result = await api.invoke('troubleshooting:run-for-error', { handlerId: 'DG-006' })
                setTroubleshootResult(result)
            }
        } catch (err: any) {
            setTroubleshootResult({ success: false, title: 'Lỗi kiểm tra', message: err.message || 'Troubleshoot failed' })
        } finally {
            setTroubleshooting(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <style>{`
        @keyframes errorModalIn {
          0% { opacity: 0; transform: scale(0.92) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes severityPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${sev.pulseColor}; }
          50% { box-shadow: 0 0 0 12px transparent; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes checkIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .error-modal-card { animation: errorModalIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .severity-pulse { animation: severityPulse 2s ease-in-out infinite; }
        .solution-item { animation: errorModalIn 0.3s ease-out both; }
      `}</style>

            <div className="error-modal-card w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200/80">

                {/* ── Header with gradient ── */}
                <div className="relative overflow-hidden rounded-t-2xl p-5 pb-4"
                    style={{ background: sev.gradient }}>

                    {/* Subtle shimmer overlay */}
                    <div className="absolute inset-0 opacity-20"
                        style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 3s linear infinite',
                        }} />

                    <div className="relative flex items-start gap-3">
                        <div className="text-3xl severity-pulse w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                            {resolution.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-white/70 text-[10px] font-bold tracking-wider uppercase">{nodeIcon} {nodeName}</span>
                            </div>
                            <h2 className="text-white font-bold text-lg leading-tight">{resolution.userTitle}</h2>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white/90 backdrop-blur-sm border border-white/20">
                                    {resolution.errorCode}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white/90 backdrop-blur-sm border border-white/20">
                                    {sev.labelIcon} {sev.label}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition cursor-pointer shrink-0"
                        >✕</button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="p-5 space-y-4">

                    {/* Cause section */}
                    <div className="rounded-xl p-4 border" style={{ backgroundColor: sev.bg, borderColor: sev.border }}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">💡 Nguyên nhân</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{resolution.cause}</p>
                    </div>

                    {/* Solutions */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">✅ Cách khắc phục</p>
                        <div className="space-y-2">
                            {resolution.solutions.map((sol, i) => (
                                <div
                                    key={i}
                                    className="solution-item flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition"
                                    style={{ animationDelay: `${i * 80}ms` }}
                                >
                                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center shrink-0 border border-emerald-200">
                                        {i + 1}
                                    </span>
                                    <p className="text-sm text-slate-600 leading-relaxed">{sol}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Raw error (collapsible) */}
                    <div>
                        <button
                            onClick={() => setShowRawError(prev => !prev)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 transition cursor-pointer flex items-center gap-1"
                        >
                            <span style={{ transform: showRawError ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms' }}>▶</span>
                            {showRawError ? 'Ẩn chi tiết kỹ thuật' : 'Xem chi tiết kỹ thuật'}
                        </button>
                        {showRawError && (
                            <div className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-300 font-mono text-[11px] leading-relaxed border border-slate-700 max-h-[120px] overflow-y-auto">
                                <span className="text-red-400">[{resolution.errorCode}]</span> {rawError}
                            </div>
                        )}
                    </div>

                    {/* Troubleshoot result inline */}
                    {troubleshootResult && (
                        <div className={`rounded-xl p-4 border ${troubleshootResult.success
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-red-50 border-red-200'
                            }`}>
                            <p className="text-[10px] uppercase tracking-wider font-bold mb-1.5"
                                style={{ color: troubleshootResult.success ? '#059669' : '#dc2626' }}>
                                🔍 Kết quả kiểm tra
                            </p>
                            <p className="text-sm font-semibold text-slate-800 mb-0.5">{troubleshootResult.title || 'Hoàn tất'}</p>
                            <p className="text-sm text-slate-600">{troubleshootResult.message || 'Hoàn tất kiểm tra'}</p>
                            {troubleshootResult.details && (
                                <ul className="mt-2 space-y-1">
                                    {Object.entries(troubleshootResult.details).map(([key, val]) => (
                                        <li key={key} className="text-xs text-slate-500">
                                            <span className="font-medium">{key}:</span> {String(val)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Action buttons ── */}
                <div className="px-5 pb-5 pt-2 flex items-center gap-2 border-t border-slate-100">
                    {resolution.retryable && (
                        <button
                            onClick={handleRetry}
                            disabled={retrying}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                        >
                            {retrying ? '⏳ Đang thử lại...' : '🔄 Thử lại'}
                        </button>
                    )}
                    {resolution.skippable && (
                        <button
                            onClick={handleSkip}
                            disabled={skipping}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                            {skipping ? '⏳ Đang bỏ qua...' : '⏭ Bỏ qua'}
                        </button>
                    )}
                    <button
                        onClick={handleTroubleshoot}
                        disabled={troubleshooting}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                        {troubleshooting ? '⏳ Đang kiểm tra...' : '🔍 Kiểm tra'}
                    </button>
                </div>
            </div>
        </div>
    )
}

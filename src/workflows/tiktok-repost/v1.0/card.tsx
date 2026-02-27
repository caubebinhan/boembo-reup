import { useMemo, useState, useEffect } from 'react'

// Per-workflow campaign card for TikTok Repost (Light Theme)
// Auto-discovered by CampaignCard via import.meta.glob

interface TikTokRepostCardProps {
    campaign: any
    onAction: (event: string, payload: any) => void
}

export default function TikTokRepostCard({ campaign, onAction }: TikTokRepostCardProps) {
    const config = useMemo(() => {
        try {
            return typeof campaign.params === 'string'
                ? JSON.parse(campaign.params)
                : campaign.params || {}
        } catch { return {} }
    }, [campaign.params])

    // ── Live state from IPC events ──
    const [liveMsg, setLiveMsg] = useState<string | null>(null)
    const [alerts, setAlerts] = useState<{ type: 'captcha' | 'violation' | 'error'; message: string }[]>([])

    useEffect(() => {
        const api = (window as any).api
        if (!api) return

        // Subscribe to node:progress for live phase messages
        const offProgress = api.on?.('node:progress', (ev: any) => {
            if (ev.campaignId === campaign.id) {
                setLiveMsg(ev.message || null)
            }
        })

        // Subscribe to node:event for alerts
        const offNodeEvent = api.on?.('node:event', (ev: any) => {
            if (ev.campaignId !== campaign.id) return
            if (ev.event === 'captcha:detected') {
                setAlerts(prev => {
                    if (prev.some(a => a.type === 'captcha')) return prev
                    return [...prev, { type: 'captcha', message: 'CAPTCHA detected — needs resolve' }]
                })
            } else if (ev.event === 'violation:detected') {
                setAlerts(prev => [...prev, { type: 'violation', message: ev.data?.error || 'Violation detected' }])
            }
        })

        // Clear live message when campaign finishes/pauses
        const offStatus = api.on?.('campaigns-updated', () => {
            // Polling will update campaign prop, clear stale live messages
        })

        return () => {
            if (typeof offProgress === 'function') offProgress()
            if (typeof offNodeEvent === 'function') offNodeEvent()
            if (typeof offStatus === 'function') offStatus()
        }
    }, [campaign.id])

    // Clear alerts when status changes
    useEffect(() => {
        if (campaign.status !== 'active' && campaign.status !== 'running') {
            setAlerts([])
        }
    }, [campaign.status])

    // Clear live message if campaign is idle/finished
    useEffect(() => {
        if (campaign.status === 'idle' || campaign.status === 'finished') {
            setLiveMsg(null)
        }
    }, [campaign.status])

    const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; blink?: boolean }> = {
        idle: { label: '⏸ Idle', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
        active: { label: '● Running', color: '#059669', bg: '#ecfdf5', border: '#86efac', blink: true },
        running: { label: '● Running', color: '#059669', bg: '#ecfdf5', border: '#86efac', blink: true },
        paused: { label: '⏸ Paused', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
        finished: { label: '✓ Done', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
        error: { label: '✕ Error', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
        needs_captcha: { label: '⚠ Captcha', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
    }

    const badge = statusConfig[campaign.status] || statusConfig.idle!
    const sourceCount = config.sources?.length || 0
    const counters = campaign.counters || {}
    const queued = counters.queued || 0
    const downloaded = counters.downloaded || 0
    const published = (counters.published || 0) + (counters.verification_incomplete || 0)
    const failed = counters.failed || 0
    const total = queued + downloaded + published + failed
    const progressPct = total > 0 ? Math.round((published / total) * 100) : 0

    return (
        <div
            onClick={() => onAction('campaign:view-details', { id: campaign.id })}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer relative overflow-hidden group shadow-sm"
        >
            {/* Progress bar accent at top */}
            {total > 0 && (
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-100">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
                </div>
            )}

            <div className="flex items-center gap-4">
                {/* Left: Name + meta + live message */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-base text-slate-800 truncate group-hover:text-purple-700 transition">{campaign.name}</h3>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${badge.blink ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: badge.bg, color: badge.color, borderColor: badge.border }}>
                            {badge.label}
                        </div>
                        {/* Live progress message — inline next to badge */}
                        {liveMsg && (campaign.status === 'active' || campaign.status === 'running') && (
                            <>
                                <span className="text-slate-300 text-xs">·</span>
                                <span className="text-[11px] text-slate-400 truncate max-w-[200px]" title={liveMsg}>{liveMsg}</span>
                            </>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">{sourceCount} source{sourceCount !== 1 ? 's' : ''} · {new Date(campaign.created_at).toLocaleDateString('vi-VN')}</p>
                </div>

                {/* Center: Compact stats */}
                <div className="flex items-center gap-3 text-xs shrink-0">
                    <div className="flex flex-col items-center" title="Queued">
                        <span className="text-base">📋</span>
                        <span className="text-slate-500 font-semibold">{queued}</span>
                    </div>
                    <div className="flex flex-col items-center" title="Downloaded">
                        <span className="text-base">⬇️</span>
                        <span className="text-slate-500 font-semibold">{downloaded}</span>
                    </div>
                    <div className="flex flex-col items-center" title="Published">
                        <span className="text-base">📤</span>
                        <span className={`font-bold ${published > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{published}</span>
                    </div>
                    {failed > 0 && (
                        <div className="flex flex-col items-center" title="Failed">
                            <span className="text-base">❌</span>
                            <span className="text-red-500 font-bold">{failed}</span>
                        </div>
                    )}
                    {total > 0 && (
                        <div className="flex flex-col items-center ml-1 pl-2 border-l border-slate-200" title="Progress">
                            <span className="text-[10px] text-slate-400 font-medium">Done</span>
                            <span className="font-bold text-purple-600 text-sm">{progressPct}%</span>
                        </div>
                    )}
                </div>

                {/* Right: Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {(campaign.status === 'idle' || campaign.status === 'error') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('campaign:trigger', { id: campaign.id }) }}
                            className="px-3 py-1.5 text-xs rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm cursor-pointer"
                        >▶ Run</button>
                    )}
                    {(campaign.status === 'active' || campaign.status === 'running') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('campaign:pause', { id: campaign.id }) }}
                            className="px-3 py-1.5 text-xs rounded-lg font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                        >⏸ Pause</button>
                    )}
                    {campaign.status === 'paused' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('campaign:resume', { id: campaign.id }) }}
                            className="px-3 py-1.5 text-xs rounded-lg font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                        >▶ Resume</button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete campaign "${campaign.name}"?`)) {
                                onAction('campaign:delete', { id: campaign.id })
                            }
                        }}
                        className="p-1.5 text-xs rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition cursor-pointer"
                    >🗑</button>
                </div>
            </div>

            {/* Alert banners — captcha / violation */}
            {alerts.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                    {alerts.map((alert, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium ${alert.type === 'captcha' ? 'bg-orange-50 text-orange-700 border border-orange-200'
                            : alert.type === 'violation' ? 'bg-red-50 text-red-600 border border-red-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                            <span>{alert.type === 'captcha' ? '⚠️' : alert.type === 'violation' ? '🚫' : '⚡'}</span>
                            <span className="truncate">{alert.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

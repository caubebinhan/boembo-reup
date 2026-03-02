import { useMemo, useState, useEffect } from 'react'

// Per-workflow campaign card for TikTok Repost (Vintage Pastel)
// Auto-discovered by CampaignCard via import.meta.glob

interface TikTokRepostCardProps {
    campaign: any
    onAction: (event: string, payload: any) => void
}

// ── Vintage Pastel Palette ──
const P = {
    bg: '#fcfbf8',
    cream: '#f5f3ee',
    beige: '#e8e4db',
    charcoal: '#2c2a29',
    textMuted: '#5c5551',
    textDim: '#8a827c',
    accent: '#7c3aed',
    accentSoft: '#f3effe',
    pastelPink: '#f4dce0',
    pastelMint: '#d4e8d8',
    pastelBlue: '#d6e4f0',
    pastelPeach: '#f9e3d3',
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
    const [alerts, setAlerts] = useState<{ type: 'captcha' | 'publish_failed' | 'error'; message: string }[]>([])

    useEffect(() => {
        const api = (window as any).api
        if (!api) return

        const offProgress = api.on?.('node:progress', (ev: any) => {
            if (ev.campaignId === campaign.id) {
                setLiveMsg(ev.message || null)
            }
        })

        const offNodeEvent = api.on?.('node:event', (ev: any) => {
            if (ev.campaignId !== campaign.id) return
            if (ev.event === 'captcha:detected') {
                setAlerts(prev => {
                    if (prev.some(a => a.type === 'captcha')) return prev
                    return [...prev, { type: 'captcha', message: 'CAPTCHA detected — needs resolve' }]
                })
            } else if (ev.event === 'violation:detected') {
                setAlerts(prev => [...prev, { type: 'publish_failed', message: ev.data?.error || 'Publish failed — content violation' }])
            }
        })

        const offStatus = api.on?.('campaigns-updated', () => {
            setLiveMsg(null)
        })

        return () => {
            if (typeof offProgress === 'function') offProgress()
            if (typeof offNodeEvent === 'function') offNodeEvent()
            if (typeof offStatus === 'function') offStatus()
        }
    }, [campaign.id])

    useEffect(() => {
        if (campaign.status !== 'active' && campaign.status !== 'running') {
            setAlerts([])
        }
    }, [campaign.status])

    useEffect(() => {
        if (['idle', 'finished', 'paused', 'error'].includes(campaign.status)) {
            setLiveMsg(null)
        }
    }, [campaign.status])

    const statusConfig: Record<string, { label: string; emoji: string; color: string; bg: string; border: string; blink?: boolean }> = {
        idle: { label: 'Idle', emoji: '💤', color: P.textDim, bg: P.cream, border: P.beige },
        active: { label: 'Running', emoji: '🌿', color: '#2e7d32', bg: P.pastelMint, border: '#94c8a0', blink: true },
        running: { label: 'Running', emoji: '🌿', color: '#2e7d32', bg: P.pastelMint, border: '#94c8a0', blink: true },
        paused: { label: 'Paused', emoji: '☕', color: '#8e5a2b', bg: P.pastelPeach, border: '#e0b896' },
        finished: { label: 'Done', emoji: '🎉', color: '#2e5a88', bg: P.pastelBlue, border: '#93b4d4' },
        error: { label: 'Error', emoji: '🥀', color: '#9e3d4d', bg: P.pastelPink, border: '#e0a8b0' },
        needs_captcha: { label: 'Captcha', emoji: '🧩', color: '#8e5a2b', bg: P.pastelPeach, border: '#e0b896' },
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
            role="button"
            tabIndex={0}
            onClick={() => onAction('campaign:view-details', { id: campaign.id })}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAction('campaign:view-details', { id: campaign.id })}
            className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-0.5"
            style={{
                background: P.bg,
                border: `1px solid ${P.beige}`,
                borderRadius: 16,
                padding: '20px',
                boxShadow: '0 1px 4px rgba(44,42,41,0.04)',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#c09ee0'
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(124,58,237,0.08)'
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = P.beige
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(44,42,41,0.04)'
            }}
        >
            {/* Progress bar accent */}
            {total > 0 && (
                <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: P.beige }}>
                    <div className="h-full transition-all duration-700"
                        style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${P.accent}, #d4e8d8)` }} />
                </div>
            )}

            <div className="flex items-center gap-4">
                {/* Left: Name + meta + live message */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-base truncate transition" style={{ color: P.charcoal }}>{campaign.name}</h3>
                        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.blink ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                            <span className="text-xs">{badge.emoji}</span>
                            {badge.label}
                        </div>
                        {liveMsg && (campaign.status === 'active' || campaign.status === 'running') && (
                            <>
                                <span className="text-xs" style={{ color: P.beige }}>·</span>
                                <span className="text-[11px] truncate max-w-[200px]" style={{ color: P.textDim }} title={liveMsg}>{liveMsg}</span>
                            </>
                        )}
                    </div>
                    <p className="text-xs" style={{ color: P.textDim }}>
                        {sourceCount} source{sourceCount !== 1 ? 's' : ''} · {new Date(campaign.created_at).toLocaleDateString('vi-VN')}
                    </p>
                </div>

                {/* Center: Compact stats with pastel pill backgrounds */}
                <div className="flex items-center gap-2 text-xs shrink-0">
                    <StatPill emoji="📥" value={queued} label="Queued" bg={P.pastelBlue} />
                    <StatPill emoji="💾" value={downloaded} label="Downloaded" bg={P.pastelPeach} />
                    <StatPill emoji="🌸" value={published} label="Published" bg={P.pastelMint}
                        valueColor={published > 0 ? '#2e7d32' : P.textDim} bold={published > 0} />
                    {failed > 0 && (
                        <StatPill emoji="🥀" value={failed} label="Failed" bg={P.pastelPink} valueColor="#9e3d4d" bold />
                    )}
                    {total > 0 && (
                        <div className="flex flex-col items-center ml-1 pl-2" style={{ borderLeft: `1px solid ${P.beige}` }} title="Progress">
                            <span className="text-[10px] font-medium" style={{ color: P.textDim }}>Done</span>
                            <span className="font-bold text-sm" style={{ color: P.accent }}>{progressPct}%</span>
                        </div>
                    )}
                </div>

                {/* Right: Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {(campaign.status === 'idle' || campaign.status === 'error') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('campaign:trigger', { id: campaign.id }) }}
                            className="px-3 py-1.5 text-xs rounded-full font-bold transition shadow-sm cursor-pointer active:scale-95"
                            style={{ background: P.pastelMint, color: '#2e7d32', border: `1px solid #94c8a0` }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#c3dac6')}
                            onMouseLeave={e => (e.currentTarget.style.background = P.pastelMint)}>
                            🌿 Run
                        </button>
                    )}
                    {(campaign.status === 'active' || campaign.status === 'running') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('campaign:pause', { id: campaign.id }) }}
                            className="px-3 py-1.5 text-xs rounded-full font-bold transition cursor-pointer active:scale-95"
                            style={{ background: P.pastelPeach, color: '#8e5a2b', border: `1px solid #e0b896` }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#ebd5c5')}
                            onMouseLeave={e => (e.currentTarget.style.background = P.pastelPeach)}>
                            ☕ Pause
                        </button>
                    )}
                    {campaign.status === 'paused' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('campaign:resume', { id: campaign.id }) }}
                            className="px-3 py-1.5 text-xs rounded-full font-bold transition cursor-pointer active:scale-95"
                            style={{ background: P.pastelMint, color: '#2e7d32', border: `1px solid #94c8a0` }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#c3dac6')}
                            onMouseLeave={e => (e.currentTarget.style.background = P.pastelMint)}>
                            🌿 Resume
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete campaign "${campaign.name}"?`)) {
                                onAction('campaign:delete', { id: campaign.id })
                            }
                        }}
                        className="p-1.5 text-xs rounded-lg transition cursor-pointer"
                        style={{ color: P.textDim }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#9e3d4d'; e.currentTarget.style.background = P.pastelPink }}
                        onMouseLeave={e => { e.currentTarget.style.color = P.textDim; e.currentTarget.style.background = 'transparent' }}>
                        🗑
                    </button>
                </div>
            </div>

            {/* Alert banners */}
            {alerts.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                    {alerts.map((alert, i) => {
                        const alertStyle = alert.type === 'captcha'
                            ? { bg: P.pastelPeach, color: '#8e5a2b', border: '#e0b896', emoji: '🧩' }
                            : alert.type === 'publish_failed'
                                ? { bg: P.pastelPink, color: '#9e3d4d', border: '#e0a8b0', emoji: '🥀' }
                                : { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', emoji: '⚡' }
                        return (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-medium"
                                style={{ background: alertStyle.bg, color: alertStyle.color, border: `1px solid ${alertStyle.border}` }}>
                                <span>{alertStyle.emoji}</span>
                                <span className="truncate">{alert.message}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Stat Pill Component ──
function StatPill({ emoji, value, label, bg, valueColor, bold }: {
    emoji: string; value: number; label: string; bg: string
    valueColor?: string; bold?: boolean
}) {
    return (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full" title={label}
            style={{ background: bg, border: `1px solid ${bg}` }}>
            <span className="text-xs">{emoji}</span>
            <span className={`text-[11px] ${bold ? 'font-bold' : 'font-medium'}`}
                style={{ color: valueColor || '#5c5551' }}>{value}</span>
        </div>
    )
}

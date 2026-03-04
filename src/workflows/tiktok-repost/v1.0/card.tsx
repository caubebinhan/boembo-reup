import { useMemo, useState, useEffect, useRef } from 'react'

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
    pastelYellow: '#fef3c7',
    pastelLavender: '#ede8f5',
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
    const [liveMsg, setLiveMsg] = useState<{ msg: string; instanceId: string } | null>(null)
    const liveMsgRef = useRef(liveMsg)
    liveMsgRef.current = liveMsg
    const [alerts, setAlerts] = useState<{ type: string; message: string }[]>([])

    useEffect(() => {
        const api = (window as any).api
        if (!api) return

        const offProgress = api.on?.('node:progress', (ev: any) => {
            if (ev.campaignId === campaign.id) {
                setLiveMsg(ev.message ? { msg: ev.message, instanceId: ev.instanceId } : null)
            }
        })

        // Clear liveMsg when the node that owns it completes/fails
        const offNodeStatus = api.on?.('node:status', (ev: any) => {
            if (ev.campaignId !== campaign.id) return
            if ((ev.status === 'completed' || ev.status === 'failed')
                && liveMsgRef.current?.instanceId === ev.instanceId) {
                setLiveMsg(null)
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
                setAlerts(prev => [...prev, { type: 'violation', message: ev.data?.error || 'Content violation detected' }])
            } else if (ev.event === 'session:expired') {
                setAlerts(prev => {
                    if (prev.some(a => a.type === 'session_expired')) return prev
                    return [...prev, { type: 'session_expired', message: 'Session expired — re-login required' }]
                })
            } else if (ev.event === 'node:failed') {
                setAlerts(prev => [...prev, { type: 'error', message: ev.data?.error || 'Node execution failed' }])
            }
        })

        // Listen for campaign-level health check failures
        const offHealthCheck = api.on?.('campaign:healthcheck-failed', (ev: any) => {
            if (ev.campaign_id === campaign.id) {
                setAlerts(prev => [...prev, { type: 'error', message: ev.message || 'Health check failed' }])
            }
        })

        // Fix #3: Listen to pipeline:info, network-error, disk-error
        const offPipelineInfo = api.on?.('pipeline:info', (ev: any) => {
            if (ev.campaignId === campaign.id) {
                setAlerts(prev => {
                    if (prev.some(a => a.message === ev.message)) return prev
                    return [...prev, { type: 'info', message: ev.message || 'System event' }]
                })
            }
        })
        const offNetworkError = api.on?.('campaign:network-error', (ev: any) => {
            if ((ev.campaignId || ev.campaign_id) === campaign.id) {
                setAlerts(prev => [...prev, { type: 'network', message: ev.message || 'Network error detected' }])
            }
        })
        const offDiskError = api.on?.('campaign:disk-error', (ev: any) => {
            if ((ev.campaignId || ev.campaign_id) === campaign.id) {
                setAlerts(prev => [...prev, { type: 'disk', message: ev.message || 'Disk error detected' }])
            }
        })

        const offStatus = api.on?.('campaigns-updated', () => setLiveMsg(null))

        return () => {
            if (typeof offProgress === 'function') offProgress()
            if (typeof offNodeStatus === 'function') offNodeStatus()
            if (typeof offNodeEvent === 'function') offNodeEvent()
            if (typeof offHealthCheck === 'function') offHealthCheck()
            if (typeof offPipelineInfo === 'function') offPipelineInfo()
            if (typeof offNetworkError === 'function') offNetworkError()
            if (typeof offDiskError === 'function') offDiskError()
            if (typeof offStatus === 'function') offStatus()
        }
    }, [campaign.id])

    useEffect(() => {
        if (campaign.status !== 'active' && campaign.status !== 'running') setAlerts([])
    }, [campaign.status])

    useEffect(() => {
        if (['idle', 'finished', 'paused', 'error'].includes(campaign.status)) setLiveMsg(null)
    }, [campaign.status])

    // ── Status config — covers ALL possible campaign statuses ──
    const statusConfig: Record<string, { label: string; emoji: string; color: string; bg: string; border: string; blink?: boolean }> = {
        idle: { label: 'Idle', emoji: '💤', color: P.textDim, bg: P.cream, border: P.beige },
        active: { label: 'Running', emoji: '🌿', color: '#2e7d32', bg: P.pastelMint, border: '#94c8a0', blink: true },
        running: { label: 'Running', emoji: '🌿', color: '#2e7d32', bg: P.pastelMint, border: '#94c8a0', blink: true },
        paused: { label: 'Paused', emoji: '☕', color: '#8e5a2b', bg: P.pastelPeach, border: '#e0b896' },
        finished: { label: 'Done', emoji: '🎉', color: '#2e5a88', bg: P.pastelBlue, border: '#93b4d4' },
        error: { label: 'Error', emoji: '🥀', color: '#9e3d4d', bg: P.pastelPink, border: '#e0a8b0' },
        cancelled: { label: 'Cancelled', emoji: '🚫', color: '#6b6b6b', bg: '#f0f0f0', border: '#d0d0d0' },
        needs_captcha: { label: 'Captcha', emoji: '🧩', color: '#8e5a2b', bg: P.pastelPeach, border: '#e0b896' },
        scheduling: { label: 'Scheduling', emoji: '📋', color: '#7c3aed', bg: P.pastelLavender, border: '#c09ee0', blink: true },
        session_expired: { label: 'Re-login', emoji: '🔑', color: '#92400e', bg: P.pastelYellow, border: '#fcd34d' },
        recovering: { label: 'Recovering', emoji: '🔄', color: '#2563eb', bg: P.pastelBlue, border: '#93b4d4', blink: true },
        degraded: { label: 'Degraded', emoji: '⚠️', color: '#d97706', bg: P.pastelPeach, border: '#e0b896' },
    }

    const badge = statusConfig[campaign.status] || statusConfig.idle!
    const sourceCount = config.sources?.length || 0
    const counters = campaign.counters || {}

    // ── Comprehensive counters ──
    const queued = counters.queued || 0
    const pendingApproval = counters.pending_approval || 0
    const downloaded = counters.downloaded || 0
    const captioned = counters.captioned || 0
    const published = counters.published || 0
    const verified = counters.verified || 0
    const underReview = counters.under_review || 0
    const verificationIncomplete = counters.verification_incomplete || 0
    const failed = counters.failed || 0
    const publishFailed = counters.publish_failed || 0
    const duplicate = counters.duplicate || 0
    const captcha = counters.captcha || 0
    const sessionExpired = counters.session_expired || 0
    const skipped = counters.skipped || 0

    // Total = all non-zero statuses
    const total = queued + pendingApproval + downloaded + captioned + published + verified +
        underReview + verificationIncomplete + failed + publishFailed + duplicate + captcha +
        sessionExpired + skipped

    // Terminal — Public success = published + verified
    const publicCount = published + verified
    // Terminal — Submitted = under_review + verification_incomplete
    const submittedCount = underReview + verificationIncomplete
    // Terminal fail = failed + publish_failed (real errors)
    const failCount = failed + publishFailed
    // Terminal skip = duplicate + skipped (not errors)
    const skipCount = duplicate + skipped
    // Progress = terminal states / total
    const terminalCount = publicCount + submittedCount + failCount + skipCount + captcha + sessionExpired
    const progressPct = total > 0 ? Math.round((terminalCount / total) * 100) : 0

    // Target account info
    const targetAccount = config.targetChannel || config.publishAccount || null
    const interval = config.intervalMinutes || null
    const videoEdits = config.videoEditOperations?.filter((o: any) => o.enabled)?.length || 0

    // Schedule info
    const scheduleLabel = useMemo(() => {
        if (!interval) return null
        if (interval < 60) return `Every ${interval}min`
        if (interval === 60) return 'Every 1h'
        if (interval % 60 === 0) return `Every ${interval / 60}h`
        return `Every ${Math.floor(interval / 60)}h ${interval % 60}m`
    }, [interval])

    // Next scheduled video
    const nextScheduled = useMemo(() => {
        try {
            const videos = campaign.videos || []
            const now = Date.now()
            const upcoming = videos
                .filter((v: any) => v.status === 'queued' && v.scheduled_for && v.scheduled_for > now)
                .sort((a: any, b: any) => a.scheduled_for - b.scheduled_for)
            if (upcoming.length === 0) return null
            const t = new Date(upcoming[0].scheduled_for)
            return t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        } catch { return null }
    }, [campaign.videos])

    // Last activity
    const lastActivity = useMemo(() => {
        const updatedAt = campaign.updated_at || campaign.created_at
        if (!updatedAt) return null
        const diff = Date.now() - new Date(updatedAt).getTime()
        if (diff < 60_000) return 'Just now'
        if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
        if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
        return `${Math.floor(diff / 86400_000)}d ago`
    }, [campaign.updated_at, campaign.created_at])

    const createdDate = new Date(campaign.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // Error message from campaign data
    const errorMessage = useMemo(() => {
        if (campaign.status !== 'error') return null
        return campaign.error_message || campaign.last_error || null
    }, [campaign.status, campaign.error_message, campaign.last_error])

    // Workflow version
    const workflowVersion = campaign.workflow_version || null

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
                padding: 0,
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
                        style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${P.accent}, #a78bfa, ${P.pastelMint})` }} />
                </div>
            )}

            {/* Main content */}
            <div style={{ padding: '16px 20px 12px' }}>
                {/* Row 1: Name + Status + Live message */}
                <div className="flex items-center gap-2.5 mb-2">
                    <h3 className="font-bold text-[15px] truncate flex-1" style={{ color: P.charcoal }}>{campaign.name}</h3>
                    <div className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.blink ? 'animate-pulse' : ''}`}
                        style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                        <span className="text-xs">{badge.emoji}</span>
                        {badge.label}
                    </div>
                </div>

                {/* Row 2: Meta chips — target account, sources, schedule, created, video edits, version, next scheduled */}
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    {targetAccount && (
                        <MetaChip icon="👤" text={typeof targetAccount === 'object' ? (targetAccount.display_name || targetAccount.username || 'Account') : targetAccount} />
                    )}
                    <MetaChip icon="📺" text={`${sourceCount} source${sourceCount !== 1 ? 's' : ''}`} />
                    {scheduleLabel && <MetaChip icon="⏰" text={scheduleLabel} />}
                    {videoEdits > 0 && <MetaChip icon="🎬" text={`${videoEdits} edit${videoEdits !== 1 ? 's' : ''}`} />}
                    {nextScheduled && <MetaChip icon="⏭️" text={`Next: ${nextScheduled}`} highlight />}
                    {workflowVersion && <MetaChip icon="📦" text={`v${workflowVersion}`} dim />}
                    <MetaChip icon="📅" text={createdDate} dim />
                    {lastActivity && <MetaChip icon="🕐" text={lastActivity} dim />}
                </div>

                {/* Error message banner */}
                {errorMessage && (
                    <div className="flex items-center gap-2 mb-2.5 px-3 py-2 rounded-xl text-[11px]"
                        style={{ background: P.pastelPink, color: '#9e3d4d', border: `1px solid #e0a8b0` }}>
                        <span>🥀</span>
                        <span className="truncate flex-1">{errorMessage}</span>
                    </div>
                )}

                {/* Live message */}
                {liveMsg && (campaign.status === 'active' || campaign.status === 'running') && (
                    <div className="flex items-center gap-1.5 mb-2.5 px-2.5 py-1.5 rounded-lg"
                        style={{ background: P.pastelMint + '60', border: `1px solid ${P.pastelMint}` }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#2e7d32' }} />
                        <span className="text-[11px] truncate" style={{ color: '#2e7d32' }}>{liveMsg.msg}</span>
                    </div>
                )}
            </div>

            {/* Row 3: Stats bar + Actions */}
            <div className="flex items-center justify-between px-5 py-2.5"
                style={{ background: P.cream, borderTop: `1px solid ${P.beige}` }}>
                {/* Stats */}
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                    <StatPill emoji="📥" value={queued} label="Queued" bg={P.pastelBlue} />
                    {pendingApproval > 0 && <StatPill emoji="⏳" value={pendingApproval} label="Pending Approval" bg={P.pastelYellow} />}
                    <StatPill emoji="💾" value={downloaded} label="Downloaded" bg={P.pastelPeach} />
                    {captioned > 0 && <StatPill emoji="✍️" value={captioned} label="Captioned" bg={P.pastelLavender} />}
                    <StatPill emoji="🌸" value={publicCount} label="Đã đăng" bg={P.pastelMint}
                        valueColor={publicCount > 0 ? '#2e7d32' : P.textDim} bold={publicCount > 0} />
                    {submittedCount > 0 && <StatPill emoji="⏳" value={submittedCount} label="Đã gửi, chờ duyệt" bg={P.pastelYellow} valueColor="#92400e" />}
                    {captcha > 0 && <StatPill emoji="🧩" value={captcha} label="Captcha" bg={P.pastelPeach} valueColor="#8e5a2b" bold />}
                    {duplicate > 0 && <StatPill emoji="🔄" value={duplicate} label="Duplicate" bg={P.cream} />}
                    {failCount > 0 && (
                        <StatPill emoji="🥀" value={failCount} label="Failed" bg={P.pastelPink} valueColor="#9e3d4d" bold />
                    )}
                    {skipped > 0 && <StatPill emoji="⏭️" value={skipped} label="Skipped" bg={P.cream} />}
                    {total > 0 && (
                        <div className="flex items-center gap-1 ml-1 pl-2" style={{ borderLeft: `1px solid ${P.beige}` }} title="Progress">
                            <span className="font-bold text-sm" style={{ color: P.accent }}>{progressPct}%</span>
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {(campaign.status === 'idle' || campaign.status === 'error') && (
                        <ActionBtn onClick={e => { e.stopPropagation(); onAction('campaign:trigger', { id: campaign.id }) }}
                            bg={P.pastelMint} color="#2e7d32" hoverBg="#c3dac6" borderColor="#94c8a0">
                            🌿 Run
                        </ActionBtn>
                    )}
                    {(campaign.status === 'active' || campaign.status === 'running') && (
                        <ActionBtn onClick={e => { e.stopPropagation(); onAction('campaign:pause', { id: campaign.id }) }}
                            bg={P.pastelPeach} color="#8e5a2b" hoverBg="#ebd5c5" borderColor="#e0b896">
                            ☕ Pause
                        </ActionBtn>
                    )}
                    {campaign.status === 'paused' && (
                        <ActionBtn onClick={e => { e.stopPropagation(); onAction('campaign:resume', { id: campaign.id }) }}
                            bg={P.pastelMint} color="#2e7d32" hoverBg="#c3dac6" borderColor="#94c8a0">
                            🌿 Resume
                        </ActionBtn>
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
                <div className="px-5 pb-3 flex flex-col gap-1">
                    {alerts.slice(0, 3).map((alert, i) => {
                        const alertStyles: Record<string, { bg: string; color: string; border: string; emoji: string }> = {
                            captcha: { bg: P.pastelPeach, color: '#8e5a2b', border: '#e0b896', emoji: '🧩' },
                            violation: { bg: P.pastelPink, color: '#9e3d4d', border: '#e0a8b0', emoji: '⛔' },
                            session_expired: { bg: P.pastelYellow, color: '#92400e', border: '#fcd34d', emoji: '🔑' },
                            publish_failed: { bg: P.pastelPink, color: '#9e3d4d', border: '#e0a8b0', emoji: '🥀' },
                            error: { bg: P.pastelPink, color: '#9e3d4d', border: '#e0a8b0', emoji: '⚠️' },
                            info: { bg: P.pastelBlue, color: '#2e5a88', border: '#93b4d4', emoji: '📢' },
                            network: { bg: P.pastelYellow, color: '#92400e', border: '#fcd34d', emoji: '🌐' },
                            disk: { bg: P.pastelPink, color: '#9e3d4d', border: '#e0a8b0', emoji: '💾' },
                        }
                        const s = alertStyles[alert.type] || alertStyles.error!
                        return (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-medium"
                                style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                                <span>{s.emoji}</span>
                                <span className="truncate">{alert.message}</span>
                            </div>
                        )
                    })}
                    {alerts.length > 3 && (
                        <span className="text-[10px] pl-2" style={{ color: P.textDim }}>+{alerts.length - 3} more alerts</span>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Sub Components ──

function MetaChip({ icon, text, dim, highlight }: { icon: string; text: string; dim?: boolean; highlight?: boolean }) {
    return (
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
            style={{
                background: highlight ? P.accentSoft : (dim ? 'transparent' : P.cream),
                color: highlight ? P.accent : (dim ? P.textDim : P.textMuted),
                border: `1px solid ${highlight ? '#c09ee0' : (dim ? 'transparent' : P.beige)}`,
                fontWeight: highlight ? 600 : 'normal',
            }}>
            <span className="text-[10px]">{icon}</span>
            <span className="truncate max-w-[120px]">{text}</span>
        </span>
    )
}

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

function ActionBtn({ onClick, bg, color, hoverBg, borderColor, children }: {
    onClick: (e: React.MouseEvent) => void; bg: string; color: string; hoverBg: string; borderColor: string; children: React.ReactNode
}) {
    return (
        <button onClick={onClick}
            className="px-3 py-1.5 text-xs rounded-full font-bold transition shadow-sm cursor-pointer active:scale-95"
            style={{ background: bg, color, border: `1px solid ${borderColor}` }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = bg)}>
            {children}
        </button>
    )
}

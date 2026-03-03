/**
 * TikTok Repost — Campaign Detail View (Light Theme — Split Layout)
 *
 * Layout:
 *   HEADER: Campaign progress ring (compact) + phase + stat badges — inline
 *   LEFT:   Video Timeline (primary focus)
 *   RIGHT:  Pipeline Visualizer + Sources + Logs (tabs)
 */
import { useState, useEffect, useCallback } from 'react'
import { PipelineVisualizer } from '@renderer/detail/shared/PipelineVisualizer'
import type { WorkflowDetailProps } from '@renderer/detail/WorkflowDetailRegistry'
import { getStatusUI, mapDbStatus } from '@nodes/tiktok-publisher/constants'
import { VideoHistory } from '@renderer/components/detail/VideoHistory'

const fmt = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}
const parseVideoMeta = (raw: any) => raw && typeof raw === 'object' ? raw : {}

// ── Types ──────────────────────────────────────────
interface TikTokVideo {
    platform_id: string
    description?: string
    author?: string
    thumbnail?: string
    stats?: { views?: number; likes?: number }
    local_path?: string
    caption?: string
    published_url?: string
    status: 'queued' | 'scanned' | 'downloading' | 'downloaded' | 'captioned' | 'publishing' | 'published' | 'verification_incomplete' | 'failed' | 'captcha' | 'publish_failed' | 'skipped' | 'processing' | 'under_review' | 'verifying_publish' | 'duplicate' | 'pending_approval'
    error?: string
    statusMessage?: string
    reviewRetry?: { attempts?: number; maxRetries?: number; nextRetryAt?: number; predictedReviewMs?: number; actualReviewMs?: number }
    scheduledAt?: number
    isActive?: boolean
    queueIndex?: number
}

interface TikTokRepostState {
    phase: 'idle' | 'scanning' | 'scheduling' | 'downloading' | 'publishing' | 'monitoring' | 'paused' | 'finished' | 'error'
    phaseMessage?: string
    videos: TikTokVideo[]
    scannedCount: number
    queuedCount: number
    downloadedCount: number
    publishedCount: number
    failedCount: number
    publishFailedCount: number
    captchaCount: number
    activeVideoId?: string
}

const INITIAL: TikTokRepostState = {
    phase: 'idle', videos: [], scannedCount: 0, queuedCount: 0, downloadedCount: 0,
    publishedCount: 0, failedCount: 0, publishFailedCount: 0, captchaCount: 0,
}

// ── State Hook ──────────────────────────────────────
function useTikTokRepostState(campaignId: string): TikTokRepostState {
    const [state, setState] = useState<TikTokRepostState>(INITIAL)

    const rebuild = useCallback(async () => {
        try {
            // @ts-ignore
            const dbVideos: any[] = await window.api.invoke('campaign:get-videos', { id: campaignId }) || []
            // @ts-ignore
            const logs: any[] = await window.api.invoke('campaign:get-logs', { id: campaignId, limit: 200 }) || []

            let phase: TikTokRepostState['phase'] = 'idle'
            let phaseMessage = ''
            const sorted = [...logs].reverse()
            for (const log of sorted) {
                const nodeId = log.node_id || ''
                if (log.event === 'node:start' && nodeId.includes('scanner')) { phase = 'scanning'; phaseMessage = 'Đang quét nguồn video...' }
                if (log.event === 'node:start' && nodeId.includes('scheduler')) { phase = 'scheduling'; phaseMessage = 'Đang lên lịch publish...' }
                if (log.event === 'node:start' && nodeId.includes('downloader')) { phase = 'downloading'; phaseMessage = 'Đang tải video...' }
                if (log.event === 'node:start' && nodeId.includes('publisher')) { phase = 'publishing'; phaseMessage = 'Đang publish...' }
                if (log.event === 'node:start' && nodeId.includes('monitor')) { phase = 'monitoring'; phaseMessage = 'Đang theo dõi video mới...' }
                if (log.event === 'campaign:finished') { phase = 'finished'; phaseMessage = log.message || 'Hoàn tất' }
                if (log.event === 'campaign:paused') { phase = 'paused'; phaseMessage = log.message || 'Đã tạm dừng' }
                if (log.event === 'campaign:error') { phase = 'error'; phaseMessage = log.message || '' }
                if (log.event === 'node:progress') { phaseMessage = log.message || phaseMessage }
            }

            const videos: TikTokVideo[] = dbVideos.map((v: any) => {
                const meta = parseVideoMeta(v.data)
                return {
                    platform_id: v.platform_id,
                    description: meta?.description || '',
                    author: meta?.author || '',
                    thumbnail: (() => {
                        const local = meta?.local_thumbnail
                        if (local) return `local-thumb://${local.replace(/\\/g, '/')}`
                        return typeof meta?.thumbnail === 'string' ? meta.thumbnail : ''
                    })(),
                    stats: meta?.stats,
                    local_path: v.local_path,
                    caption: meta?.generated_caption || meta?.description || '',
                    published_url: v.publish_url,
                    status: mapDbStatusLocal(v.status),
                    error: undefined,
                    scheduledAt: v.scheduled_for || undefined,
                    queueIndex: v.queue_index ?? undefined,
                }
            })

            setState(prev => ({
                phase, phaseMessage,
                videos: videos.map(v => {
                    const prevVideo = prev.videos.find(p => p.platform_id === v.platform_id)
                    return { ...v, isActive: v.platform_id === prev.activeVideoId, statusMessage: prevVideo?.statusMessage, reviewRetry: prevVideo?.reviewRetry }
                }),
                scannedCount: videos.length,
                queuedCount: videos.filter(v => v.status === 'queued').length,
                downloadedCount: videos.filter(v => ['downloaded', 'captioned', 'publishing', 'published', 'verification_incomplete'].includes(v.status)).length,
                publishedCount: videos.filter(v => ['published', 'verification_incomplete'].includes(v.status)).length,
                failedCount: videos.filter(v => ['failed', 'publish_failed'].includes(v.status)).length,
                publishFailedCount: videos.filter(v => v.status === 'failed' && v.local_path).length,
                captchaCount: videos.filter(v => v.status === 'captcha').length,
                activeVideoId: prev.activeVideoId,
            }))
        } catch (err) { console.error('[TikTokRepostDetail] Failed to rebuild state:', err) }
    }, [campaignId])

    useEffect(() => {
        rebuild()
        const timer = setInterval(rebuild, 3000)
        // @ts-ignore
        const offData = window.api?.on('execution:node-data', (ev: any) => { if (ev.campaignId === campaignId) rebuild() })
        // @ts-ignore
        const offProgress = window.api?.on('node:progress', (ev: any) => { if (ev.campaignId === campaignId) setState(prev => ({ ...prev, phaseMessage: ev.message })) })
        // @ts-ignore
        const offNodeEvent = window.api?.on('node:event', (ev: any) => {
            if (ev.campaignId !== campaignId) return
            if (ev.event === 'video:active') {
                setState(prev => ({ ...prev, activeVideoId: ev.data?.videoId, videos: prev.videos.map(v => ({ ...v, isActive: v.platform_id === ev.data?.videoId })) }))
            } else if (ev.event === 'captcha:detected') {
                setState(prev => ({ ...prev, videos: prev.videos.map(v => v.platform_id === ev.data?.videoId ? { ...v, status: 'captcha' as const } : v), captchaCount: prev.captchaCount + 1 }))
            } else if (ev.event === 'violation:detected') {
                setState(prev => ({ ...prev, videos: prev.videos.map(v => v.platform_id === ev.data?.videoId ? { ...v, status: 'publish_failed' as const, error: ev.data?.error } : v) }))
            } else if (ev.event === 'video:published') {
                rebuild()
            } else if (ev.event === 'video:publish-status') {
                setState(prev => ({
                    ...prev,
                    videos: prev.videos.map(v =>
                        v.platform_id === ev.data?.videoId ? {
                            ...v, status: (ev.data?.status || v.status) as TikTokVideo['status'],
                            published_url: ev.data?.videoUrl || v.published_url,
                            statusMessage: ev.data?.message || v.statusMessage,
                            reviewRetry: { attempts: ev.data?.attempts, maxRetries: ev.data?.maxRetries, nextRetryAt: ev.data?.nextRetryAt, predictedReviewMs: ev.data?.predictedReviewMs, actualReviewMs: ev.data?.actualReviewMs },
                        } : v
                    ),
                }))
            } else if (ev.event === 'video:duplicate-detected') {
                setState(prev => ({
                    ...prev,
                    videos: prev.videos.map(v =>
                        v.platform_id === ev.data?.videoId ? {
                            ...v, status: 'duplicate' as const,
                            published_url: ev.data?.existingVideoUrl || v.published_url,
                            statusMessage: `Duplicate on @${ev.data?.accountUsername || 'unknown'} (${ev.data?.matchedBy || 'match'})${ev.data?.existingVideoUrl ? ` — ${ev.data.existingVideoUrl}` : ''}`,
                        } : v
                    ),
                }))
            }
        })
        return () => {
            clearInterval(timer)
            if (typeof offData === 'function') offData()
            if (typeof offProgress === 'function') offProgress()
            if (typeof offNodeEvent === 'function') offNodeEvent()
        }
    }, [campaignId, rebuild])

    return state
}

function mapDbStatusLocal(dbStatus: string): TikTokVideo['status'] {
    return mapDbStatus(dbStatus) as TikTokVideo['status']
}

// ── UI Constants ──────────────────────────────────
// Status UI config is imported from '@nodes/tiktok-publisher/constants'
// Use getStatusUI(status) for dynamic lookup with graceful fallback

const PHASE_UI: Record<string, { label: string; icon: string; color: string }> = {
    idle: { label: 'Sẵn sàng', icon: '⏸', color: '#94a3b8' },
    scanning: { label: 'Đang quét...', icon: '🔍', color: '#7c3aed' },
    scheduling: { label: 'Lên lịch...', icon: '📋', color: '#ca8a04' },
    downloading: { label: 'Tải video...', icon: '⬇️', color: '#2563eb' },
    publishing: { label: 'Publishing...', icon: '📤', color: '#059669' },
    monitoring: { label: 'Monitoring...', icon: '👁', color: '#0891b2' },
    paused: { label: 'Tạm dừng', icon: '⏸', color: '#d97706' },
    finished: { label: 'Hoàn tất', icon: '✅', color: '#059669' },
    error: { label: 'Lỗi', icon: '❌', color: '#dc2626' },
}

// ── Compact Progress Ring for Header ────────────
function MiniProgressRing({ percent, color }: { percent: number; color: string }) {
    const r = 14; const c = 2 * Math.PI * r; const offset = c - (percent / 100) * c
    return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0 -rotate-90">
            <circle cx="18" cy="18" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
        </svg>
    )
}

// ── Video Card ──────────────────────────────────
function VideoCard({ video, index, campaignId }: { video: TikTokVideo; index: number; campaignId: string }) {
    const api = (window as any).api
    const sc = getStatusUI(video.status)
    const isActive = video.isActive
    const [historyExpanded, setHistoryExpanded] = useState(false)
    const scheduledTime = video.scheduledAt ? new Date(video.scheduledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null
    const tiktokSourceUrl = video.platform_id ? `https://www.tiktok.com/@${video.author || '_'}/video/${video.platform_id}` : null

    return (
        <div className="animate-slide-up" style={{ opacity: video.status === 'skipped' ? 0.5 : 1, animationDelay: `${index * 20}ms` }}>
            <div className={`rounded-xl p-3 transition-all bg-white border hover:shadow-md ${isActive ? 'shadow-md border-2' : 'border-slate-200 shadow-sm'}`}
                style={{ borderColor: isActive ? sc.color : undefined, boxShadow: isActive ? `0 2px 12px ${sc.color}20` : undefined }}>

                {isActive && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider font-bold" style={{ color: sc.color }}>
                        <span className="animate-pulse">●</span> Publishing now...
                    </div>
                )}

                <div className="flex items-start gap-3">
                    {video.thumbnail ? (
                        <img src={video.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-100"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">🎬</div>
                    )}

                    <div className="flex-1 min-w-0">
                        {/* Row 1: Time + Status + Author */}
                        <div className="flex items-center gap-2 mb-1">
                            {scheduledTime && (
                                <div className="group relative">
                                    <input type="time" className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        onChange={async (e) => {
                                            const [h, m] = e.target.value.split(':').map(Number)
                                            const newDate = new Date(video.scheduledAt!); newDate.setHours(h, m, 0, 0)
                                            await api.invoke('video:reschedule', { platformId: video.platform_id, campaignId, scheduledFor: newDate.getTime() })
                                        }} />
                                    <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 group-hover:border-purple-300 group-hover:text-purple-600 transition cursor-pointer">
                                        🕒 {scheduledTime}
                                    </span>
                                </div>
                            )}
                            <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border" style={{ color: sc.color, backgroundColor: sc.bg, borderColor: sc.border }}>
                                {sc.label}
                            </span>
                            <span className="text-[10px] text-slate-300 font-mono ml-auto">#{index + 1}</span>
                        </div>

                        {/* Row 2: Caption */}
                        <p className="text-xs text-slate-700 line-clamp-1 font-medium">
                            {video.caption || video.description || 'Untitled Video'}
                        </p>

                        {/* Row 3: Stats + Links */}
                        <div className="flex items-center justify-between mt-1.5">
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                {video.author && <span>@{video.author}</span>}
                                {video.stats?.views != null && <span>👁 {fmt(video.stats.views)}</span>}
                                {video.stats?.likes != null && <span>❤ {fmt(video.stats.likes)}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                {tiktokSourceUrl && (
                                    <a href={tiktokSourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-sky-500 hover:text-sky-600 font-bold transition" title="View original on TikTok">
                                        🔗 Source
                                    </a>
                                )}
                                {video.published_url && (
                                    <a href={video.published_url} target="_blank" rel="noreferrer" className="text-[10px] text-purple-600 hover:text-purple-700 font-bold transition" title="View published video">
                                        📤 Published
                                    </a>
                                )}
                                {video.local_path && (
                                    <button className="text-[10px] text-slate-500 hover:text-slate-700 font-bold transition cursor-pointer"
                                        onClick={() => api.invoke('video:show-in-explorer', { path: video.local_path })}>
                                        📂
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Error / Status Messages — Enhanced with error code + CTA */}
                        {video.error && (() => {
                            const codeMatch = video.error.match(/\[?(DG-\d{3})\]?/)
                            const errorCode = codeMatch?.[1]
                            return (
                                <div className="mt-1.5 rounded-xl bg-red-50 border border-red-200 overflow-hidden">
                                    <div className="px-2.5 py-1.5 flex items-start gap-2">
                                        <span className="text-red-400 text-sm shrink-0 mt-0.5">⚠️</span>
                                        <div className="flex-1 min-w-0">
                                            {errorCode && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200 mr-1.5">{errorCode}</span>
                                            )}
                                            <span className="text-[10px] text-red-600 leading-relaxed">
                                                {video.error.replace(/\[?DG-\d{3}\]?\s*[-–—]?\s*/, '')}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // Dispatch custom event to open NodeErrorModal from campaign detail
                                            window.dispatchEvent(new CustomEvent('boembo:show-node-error', {
                                                detail: { campaignId, errorCode, error: video.error, videoId: video.platform_id }
                                            }))
                                        }}
                                        className="w-full px-2.5 py-1.5 text-[10px] font-bold text-red-600 bg-red-100/50 hover:bg-red-100 border-t border-red-200 transition cursor-pointer flex items-center justify-center gap-1"
                                    >
                                        📋 Xem chi tiết lỗi
                                    </button>
                                </div>
                            )
                        })()}
                        {video.statusMessage && ['under_review', 'verifying_publish', 'verification_incomplete', 'duplicate'].includes(video.status) && (
                            <p className="text-[10px] mt-1.5 rounded-lg px-2 py-1 border text-amber-700 bg-amber-50 border-amber-200">
                                {video.statusMessage}
                                {!!video.reviewRetry?.nextRetryAt && video.status === 'under_review' && (
                                    <span className="text-amber-600"> Next: {new Date(video.reviewRetry.nextRetryAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                )}
                            </p>
                        )}
                        {video.status === 'captcha' && (
                            <button className="mt-1.5 w-full text-[10px] font-bold px-2 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition uppercase tracking-wider shadow cursor-pointer"
                                onClick={() => api?.send('captcha:resolve', { videoId: video.platform_id, campaignId })}>
                                Resolve CAPTCHA
                            </button>
                        )}
                    </div>
                </div>

                {/* History toggle button */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <button
                        onClick={() => setHistoryExpanded(prev => !prev)}
                        className="text-[10px] text-slate-400 hover:text-purple-600 transition cursor-pointer flex items-center gap-1"
                    >
                        <span style={{ transform: historyExpanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms' }}>▶</span>
                        {historyExpanded ? 'Hide history' : 'Show history'}
                    </button>
                </div>

                {/* Expandable history */}
                <VideoHistory
                    campaignId={campaignId}
                    videoId={video.platform_id}
                    isExpanded={historyExpanded}
                />
            </div>
        </div>
    )
}

// ── Execution Log Viewer ────────────────────────
function ExecutionLogs({ campaignId }: { campaignId: string }) {
    const [logs, setLogs] = useState<any[]>([])
    const [filter, setFilter] = useState('')

    useEffect(() => {
        const fetch = async () => {
            try {
                // @ts-ignore
                const data = await window.api.invoke('campaign:get-logs', { id: campaignId, limit: 200 })
                if (data) setLogs(data)
            } catch { }
        }
        fetch()
        const timer = setInterval(fetch, 3000)
        return () => clearInterval(timer)
    }, [campaignId])

    const levelColors: Record<string, string> = { info: '#475569', warn: '#ca8a04', error: '#dc2626', debug: '#94a3b8' }
    const filtered = filter ? logs.filter(l => l.message?.toLowerCase().includes(filter.toLowerCase()) || l.level?.includes(filter.toLowerCase())) : logs

    return (
        <div className="animate-fade-in">
            <div className="mb-2">
                <input type="text" placeholder="🔍 Filter logs..." value={filter} onChange={e => setFilter(e.target.value)}
                    className="w-full max-w-xs px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition text-slate-700 placeholder:text-slate-300" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {filtered.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">No logs yet</p>
                ) : (
                    <div className="max-h-[400px] overflow-y-auto font-mono text-[11px]">
                        {filtered.map((log, i) => (
                            <div key={i} className="flex gap-2 py-1 px-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition">
                                <span className="text-slate-400 shrink-0 w-[60px]">{new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                <span className="shrink-0 w-[40px] uppercase font-bold" style={{ color: levelColors[log.level] || '#94a3b8' }}>{log.level}</span>
                                <span className="text-purple-500/60 shrink-0 w-[80px] truncate">{log.instance_id || log.node_id || ''}</span>
                                <span className="text-slate-600 truncate flex-1">{log.message}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Right-side Tab Button ────────────────────────
function SideTab({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
    return (
        <button onClick={onClick}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${active ? 'bg-white text-purple-700 shadow-sm border border-purple-200' : 'text-slate-400 hover:text-slate-600 hover:bg-white/60'}`}>
            <span>{icon}</span>{label}
        </button>
    )
}

// ══════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════

function TikTokRepostDetail({ campaignId, campaign, workflowId }: WorkflowDetailProps) {
    const state = useTikTokRepostState(campaignId)
    const config = campaign?.params || {}
    const [rightTab, setRightTab] = useState<'pipeline' | 'sources' | 'logs'>('pipeline')
    const [pipelineExpanded, setPipelineExpanded] = useState(false)

    const sources = config.sources || []
    const gapMinutes = config.intervalMinutes
    const phase = PHASE_UI[state.phase] || PHASE_UI.idle
    const percent = state.scannedCount > 0 ? Math.round((state.publishedCount / state.scannedCount) * 100) : 0

    // Per-source video counts (match by author name = source name)
    const videosBySource = state.videos.reduce((acc: Record<string, TikTokVideo[]>, v) => {
        const author = v.author || 'unknown'
        if (!acc[author]) acc[author] = []
        acc[author].push(v)
        return acc
    }, {})

    // Human-readable scan condition builder
    const buildScanLabel = (s: any): string => {
        const parts: string[] = []
        if (s.minLikes) parts.push(`ít nhất ${Number(s.minLikes).toLocaleString()} likes`)
        if (s.minViews) parts.push(`ít nhất ${Number(s.minViews).toLocaleString()} lượt xem`)
        if (s.maxViews) parts.push(`tối đa ${Number(s.maxViews).toLocaleString()} lượt xem`)
        if (s.withinDays) parts.push(`trong ${s.withinDays} ngày gần nhất`)
        if (s.maxVideos) parts.push(`tối đa ${s.maxVideos} video`)
        return parts.length > 0 ? parts.join(', ') : 'Tất cả video'
    }

    return (
        <div className="flex flex-col h-full max-w-full gap-3">

            {/* ── PER-CHANNEL STATS STRIP ── */}
            {sources.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {sources.map((s: any, i: number) => {
                        const sv = videosBySource[s.name] || []
                        const pub = sv.filter((v: TikTokVideo) => ['published', 'verification_incomplete'].includes(v.status)).length
                        const q = sv.filter((v: TikTokVideo) => v.status === 'queued').length
                        const fail = sv.filter((v: TikTokVideo) => v.status === 'failed').length
                        const total = sv.length
                        return (
                            <div key={s.name || `src-${i}`} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm text-xs">
                                {s.avatar
                                    ? <img src={s.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                    : <span className="text-[11px] shrink-0">{s.type === 'channel' ? '📺' : '🔑'}</span>
                                }
                                <span className="font-semibold text-slate-700 max-w-[120px] truncate">{s.name}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-400">{total} video</span>
                                {pub > 0 && <span className="text-emerald-600 font-bold">✓{pub}</span>}
                                {q > 0 && <span className="text-amber-600 font-bold">⏳{q}</span>}
                                {fail > 0 && <span className="text-red-500 font-bold">✗{fail}</span>}
                            </div>
                        )
                    })}
                    {/* Progress ring — only when publishing is underway */}
                    {percent > 0 && (
                        <div className="relative flex items-center justify-center shrink-0 ml-1">
                            <MiniProgressRing percent={percent} color={phase.color} />
                            <span className="absolute text-[8px] font-bold text-slate-600">{percent}%</span>
                        </div>
                    )}
                </div>
            )}

            {/* ── SPLIT LAYOUT: Timeline (left 50%) | Pipeline/Sources/Logs (right 50%) ── */}
            <div className="flex gap-4 flex-1 min-h-0">

                {/* LEFT: Video Timeline — exactly 50% width, independent scroll */}
                <div className="w-1/2 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">📋</span>
                            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Video Timeline</span>
                            <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-200 font-bold">{state.videos.length}</span>
                        </div>
                        {/* Gap badge moved here — next to video count */}
                        {gapMinutes && <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">⏱ {gapMinutes}min gap</span>}
                    </div>

                    {/* Independent scroll — only this panel scrolls, not the whole page */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                        {state.videos.length === 0 ? (
                            <div className="text-slate-400 text-sm text-center py-16 flex flex-col items-center gap-2">
                                <span className="text-3xl">📭</span>
                                No videos yet. Run the campaign to start.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {(() => {
                                    const sorted = [...state.videos].sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0))
                                    const now = new Date()
                                    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
                                    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
                                    const tomorrowKey = `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`
                                    let lastDateKey = ''
                                    const elements: React.ReactNode[] = []

                                    for (let i = 0; i < sorted.length; i++) {
                                        const video = sorted[i]
                                        const d = video.scheduledAt ? new Date(video.scheduledAt) : null
                                        const dateKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'unknown'

                                        if (dateKey !== lastDateKey && d) {
                                            const isToday = dateKey === todayKey
                                            const isTomorrow = dateKey === tomorrowKey
                                            const label = isToday ? 'Today' : isTomorrow ? `Tomorrow (${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })})` : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

                                            elements.push(
                                                <div key={`date-${dateKey}`} className="sticky top-0 z-10 flex items-center gap-2 py-1.5 bg-white/90 backdrop-blur-sm">
                                                    <div className="h-px flex-1 bg-slate-200" />
                                                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 shadow-sm"
                                                        style={{
                                                            background: isToday ? '#eff6ff' : isTomorrow ? '#f5f3ff' : '#f1f5f9',
                                                            color: isToday ? '#2563eb' : isTomorrow ? '#7c3aed' : '#64748b',
                                                            border: `1px solid ${isToday ? '#bfdbfe' : isTomorrow ? '#c4b5fd' : '#e2e8f0'}`,
                                                        }}>
                                                        {isToday && '📅 '}{isTomorrow && '📆 '}{label}
                                                    </span>
                                                    <div className="h-px flex-1 bg-slate-200" />
                                                </div>
                                            )
                                            lastDateKey = dateKey
                                        }
                                        elements.push(<VideoCard key={video.platform_id || i} video={video} index={i} campaignId={campaignId} />)
                                    }
                                    return elements
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: Pipeline / Sources / Logs — remaining 50% */}
                <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                    {/* Right-side Tabs */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                        <SideTab active={rightTab === 'pipeline'} label="Pipeline" icon="⚙️" onClick={() => setRightTab('pipeline')} />
                        <SideTab active={rightTab === 'sources'} label="Sources" icon="📡" onClick={() => setRightTab('sources')} />
                        <SideTab active={rightTab === 'logs'} label="Logs" icon="📃" onClick={() => setRightTab('logs')} />
                    </div>

                    <div className="flex-1 overflow-hidden min-h-0">
                        {rightTab === 'pipeline' && (
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm h-full overflow-auto animate-fade-in flex flex-col">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pipeline</span>
                                    <button
                                        onClick={() => setPipelineExpanded(true)}
                                        className="text-slate-400 hover:text-purple-600 p-1 rounded-lg hover:bg-purple-50 transition cursor-pointer text-xs"
                                        title="Open fullscreen"
                                    >⛶</button>
                                </div>
                                <div className="flex-1 overflow-auto p-3">
                                    <PipelineVisualizer campaignId={campaignId} workflowId={workflowId} vertical />
                                </div>
                            </div>
                        )}

                        {/* Pipeline expanded modal */}
                        {pipelineExpanded && (
                            <div
                                role="dialog"
                                aria-modal="true"
                                aria-label="Pipeline expanded view"
                                className="fixed inset-0 z-50 flex items-center justify-center"
                                style={{ backgroundColor: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
                                onClick={(e) => { if (e.target === e.currentTarget) setPipelineExpanded(false) }}
                            >
                                <div
                                    className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                                    style={{
                                        width: '85vw', height: '85vh',
                                        animation: 'pipelineExpand 0.38s ease-out both',
                                    }}
                                >
                                    <style>{`
                                        @keyframes pipelineExpand {
                                            from { opacity: 0; transform: scale(0.88) translateY(12px); }
                                            to   { opacity: 1; transform: scale(1) translateY(0); }
                                        }
                                    `}</style>
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                                        <span className="text-sm font-bold text-slate-700">⚙️ Pipeline — Fullscreen</span>
                                        <button
                                            className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer text-sm"
                                            onClick={() => setPipelineExpanded(false)}
                                        >✕</button>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4">
                                        <PipelineVisualizer campaignId={campaignId} workflowId={workflowId} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {rightTab === 'sources' && (
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm h-full overflow-auto animate-fade-in">
                                {/* ── Aggregate stats ── */}
                                <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">📊 Thống kê tổng</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Scanned', value: state.scannedCount, color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
                                            { label: 'Queued', value: state.queuedCount, color: '#ca8a04', bg: '#fefce8', border: '#fde047' },
                                            { label: 'Published', value: state.publishedCount, color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
                                            { label: 'Failed', value: state.failedCount, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
                                        ].map(s => (
                                            <div key={s.label} className="flex items-center justify-between rounded-lg px-3 py-2 border text-xs"
                                                style={{ backgroundColor: s.bg, borderColor: s.border }}>
                                                <span style={{ color: s.color }} className="font-medium">{s.label}</span>
                                                <span style={{ color: s.color }} className="font-bold text-sm">{s.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Per-source breakdown ── */}
                                <div className="p-4">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">📡 Từng nguồn</p>
                                    {sources.length === 0 ? (
                                        <p className="text-slate-400 text-sm text-center py-8">No sources configured</p>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {sources.map((s: any, i: number) => {
                                                const sourceVideos = videosBySource[s.name] || []
                                                const pubCount = sourceVideos.filter(v => ['published', 'verification_incomplete'].includes(v.status)).length
                                                const qCount = sourceVideos.filter(v => v.status === 'queued').length
                                                const failCount = sourceVideos.filter(v => v.status === 'failed').length
                                                const scanLabel = buildScanLabel(s)

                                                return (
                                                    <div key={s.name || `src-${i}`} className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                                        {/* Channel identity row */}
                                                        <div className="flex items-center gap-2.5">
                                                            {/* Avatar or icon */}
                                                            <div className="w-9 h-9 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                                                {s.avatar
                                                                    ? <img src={s.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                                                    : (s.name?.charAt(0)?.toUpperCase() || (s.type === 'channel' ? '📺' : '#'))
                                                                }
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="font-bold text-sm text-slate-800 truncate">{s.name || 'Unknown'}</span>
                                                                    {s.type === 'keyword' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 shrink-0">Keyword</span>}
                                                                    {s.autoSchedule === false && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 shrink-0">Manual</span>}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                                                    {s.followerCount != null && <span>👥 {Number(s.followerCount).toLocaleString()}</span>}
                                                                    {s.likeCount != null && <span>❤️ {Number(s.likeCount).toLocaleString()}</span>}
                                                                    {!s.followerCount && !s.likeCount && <span className="text-slate-300">{s.type === 'channel' ? '📺 Channel' : '🔑 Keyword'}</span>}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Scan conditions human-readable */}
                                                        <p className="text-[10px] text-slate-500 bg-white rounded-lg px-2 py-1.5 border border-slate-200 leading-relaxed">
                                                            🔎 {scanLabel}
                                                        </p>

                                                        {/* Per-source video stats */}
                                                        {sourceVideos.length > 0 ? (
                                                            <div className="flex items-center gap-2 flex-wrap text-[10px] pt-0.5">
                                                                <span className="text-slate-500 font-medium">{sourceVideos.length} video</span>
                                                                {pubCount > 0 && <span className="text-emerald-600 font-bold">✓ {pubCount} published</span>}
                                                                {qCount > 0 && <span className="text-amber-600 font-bold">⏳ {qCount} queued</span>}
                                                                {failCount > 0 && <span className="text-red-600 font-bold">✗ {failCount} failed</span>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-300">Chưa có video từ nguồn này</span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {rightTab === 'logs' && (
                            <div className="h-full overflow-auto">
                                <ExecutionLogs campaignId={campaignId} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TikTokRepostDetail

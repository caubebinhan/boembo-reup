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
import { getStatusUI, mapDbStatus, computeGroupTotals } from '@nodes/tiktok-publisher/constants'
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
    data?: Record<string, any>
}

interface TikTokRepostState {
    phase: 'idle' | 'scanning' | 'scheduling' | 'downloading' | 'editing' | 'captioning' | 'dedup' | 'checking_time' | 'publishing' | 'monitoring' | 'paused' | 'finished' | 'error'
    phaseMessage?: string
    videos: TikTokVideo[]
    activeVideoId?: string
    activeInstanceId?: string
}

const INITIAL: TikTokRepostState = {
    phase: 'idle', videos: [],
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

            const PHASE_MAP: Record<string, { phase: TikTokRepostState['phase']; msg: string }> = {
                'start_gate': { phase: 'checking_time', msg: 'Đang chờ lịch khởi chạy...' },
                'scanner_1': { phase: 'scanning', msg: 'Đang quét nguồn video...' },
                'scheduler_1': { phase: 'scheduling', msg: 'Đang lên lịch publish...' },
                'check_time_1': { phase: 'checking_time', msg: 'Đang chờ lịch publish...' },
                'dedup_1': { phase: 'dedup', msg: 'Đang kiểm tra trùng...' },
                'downloader_1': { phase: 'downloading', msg: 'Đang tải video...' },
                'video_edit_1': { phase: 'editing', msg: 'Đang chỉnh sửa video...' },
                'caption_1': { phase: 'captioning', msg: 'Đang tạo caption...' },
                'account_dedup_1': { phase: 'dedup', msg: 'Đang kiểm tra tài khoản trùng...' },
                'publisher_1': { phase: 'publishing', msg: 'Đang đăng video...' },
                'cond_mode_check_1': { phase: 'monitoring', msg: 'Đang kiểm tra chế độ...' },
                'monitor_1': { phase: 'monitoring', msg: 'Đang theo dõi video mới...' },
                'finish_1': { phase: 'finished', msg: 'Hoàn tất' },
            }

            let phase: TikTokRepostState['phase'] = 'idle'
            let phaseMessage = ''
            const sorted = [...logs].reverse()
            for (const log of sorted) {
                if (log.event === 'node:start') {
                    const match = PHASE_MAP[log.instance_id]
                    if (match) { phase = match.phase; phaseMessage = match.msg }
                }
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
                    data: meta,
                }
            })

            setState(prev => ({
                phase, phaseMessage,
                videos: videos.map(v => {
                    const prevVideo = prev.videos.find(p => p.platform_id === v.platform_id)
                    return { ...v, isActive: v.platform_id === prev.activeVideoId, statusMessage: prevVideo?.statusMessage, reviewRetry: prevVideo?.reviewRetry }
                }),
                activeVideoId: prev.activeVideoId,
                activeInstanceId: prev.activeInstanceId,
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
            // Set activeVideoId for any processing event that carries a videoId
            const PROCESSING_EVENTS = ['video:active', 'video:downloading', 'video:editing',
                'video-edit:started', 'caption:transformed']
            if (PROCESSING_EVENTS.includes(ev.event) && ev.data?.videoId) {
                setState(prev => ({ ...prev, activeVideoId: ev.data.videoId, activeInstanceId: ev.instanceId, videos: prev.videos.map(v => ({ ...v, isActive: v.platform_id === ev.data.videoId })) }))
            } else if (ev.event === 'captcha:detected') {
                setState(prev => ({ ...prev, videos: prev.videos.map(v => v.platform_id === ev.data?.videoId ? { ...v, status: 'captcha' as const } : v) }))
            } else if (ev.event === 'violation:detected') {
                setState(prev => ({ ...prev, videos: prev.videos.map(v => v.platform_id === ev.data?.videoId ? { ...v, status: 'publish_failed' as const, error: ev.data?.error } : v) }))
            } else if (ev.event === 'video:published' || ev.event === 'video:submitted') {
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
                            statusMessage: (() => {
                                const matchLabels: Record<string, string> = {
                                    source_platform_id: 'ID video gốc', file_fingerprint: 'nội dung file',
                                    claim_row: 'đã claim', unknown: 'tự động',
                                }
                                const matchLabel = matchLabels[ev.data?.matchedBy] || ev.data?.matchedBy || 'tự động'
                                return `Trùng lặp trên @${ev.data?.accountUsername || 'unknown'} (${matchLabel})${ev.data?.existingVideoUrl ? ` — ${ev.data.existingVideoUrl}` : ''}`
                            })(),
                        } : v
                    ),
                }))
            }

            // ── Clear activeVideoId on any terminal video event ──
            const TERMINAL_STATUSES = new Set(['published', 'verified', 'under_review', 'verification_incomplete', 'failed', 'publish_failed', 'captcha', 'duplicate', 'skipped', 'session_expired'])
            const clearVid = ev.data?.videoId
            if (clearVid) {
                const shouldClear =
                    ['video:published', 'violation:detected', 'captcha:detected', 'session:expired', 'video:duplicate-detected'].includes(ev.event)
                    || (ev.event === 'video:publish-status' && TERMINAL_STATUSES.has(ev.data?.status))
                    || (ev.event === 'node:failed' && !!ev.data?.videoId)
                if (shouldClear) {
                    setState(prev => ({
                        ...prev,
                        activeVideoId: prev.activeVideoId === clearVid ? undefined : prev.activeVideoId,
                        videos: prev.videos.map(v => v.platform_id === clearVid ? { ...v, isActive: false } : v),
                    }))
                }
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
    editing: { label: 'Chỉnh sửa video...', icon: '🎬', color: '#7c3aed' },
    captioning: { label: 'Tạo caption...', icon: '✍️', color: '#0891b2' },
    dedup: { label: 'Kiểm tra trùng...', icon: '🔍', color: '#6366f1' },
    checking_time: { label: 'Chờ lịch đăng...', icon: '⏰', color: '#d97706' },
    publishing: { label: 'Đang đăng...', icon: '📤', color: '#059669' },
    monitoring: { label: 'Đang theo dõi...', icon: '👁', color: '#0891b2' },
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
function VideoCard({ video, index, campaignId, phase, activeInstanceId }: { video: TikTokVideo; index: number; campaignId: string; phase: string; activeInstanceId?: string }) {
    const api = (window as any).api
    const sc = getStatusUI(video.status)
    const isActive = video.isActive
    const [historyExpanded, setHistoryExpanded] = useState(false)
    const [retrying, setRetrying] = useState(false)
    const scheduledTime = video.scheduledAt ? new Date(video.scheduledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null
    const tiktokSourceUrl = video.platform_id ? `https://www.tiktok.com/@${video.author || '_'}/video/${video.platform_id}` : null

    // Which node to retry — only publisher-specific statuses (generic 'failed' could be any node)
    const RETRY_STATUS_NODE: Record<string, string> = {
        'publish_failed': 'publisher_1',
        'captcha': 'publisher_1',
    }
    const retryNodeInstanceId = RETRY_STATUS_NODE[video.status]
    const canRetry = !!retryNodeInstanceId

    const handleRetry = async () => {
        if (!retryNodeInstanceId || retrying) return
        setRetrying(true)
        try {
            await api?.invoke?.('pipeline:retry-node', {
                campaignId,
                instanceId: retryNodeInstanceId,
                videoId: video.platform_id,
            })
            // Don't permanently hide — if job runs and fails again the button must reappear.
            // The 3s polling cycle will update video.status away from 'publish_failed' while job runs.
        } catch (err) {
            console.error('[VideoCard] Retry failed:', err)
        } finally {
            setRetrying(false)
        }
    }

    return (
        <div className="animate-slide-up" style={{ opacity: video.status === 'skipped' ? 0.5 : 1, animationDelay: `${index * 20}ms` }}>
            <div className={`rounded-xl p-3 transition-all bg-white border hover:shadow-md ${isActive ? 'shadow-md border-2' : 'border-slate-200 shadow-sm'}`}
                style={{ borderColor: isActive ? sc.color : undefined, boxShadow: isActive ? `0 2px 12px ${sc.color}20` : undefined }}>

                {isActive && (() => {
                    const INSTANCE_LABELS: Record<string, string> = {
                        'downloader_1': '⬇️ Đang tải...',
                        'video_edit_1': '🎬 Đang chỉnh sửa...',
                        'caption_1': '✍️ Đang tạo caption...',
                        'dedup_1': '🔍 Đang kiểm tra trùng...',
                        'account_dedup_1': '🔍 Đang kiểm tra tài khoản...',
                        'publisher_1': '📤 Đang đăng...',
                        'check_time_1': '⏰ Đang chờ lịch...',
                    }
                    const PHASE_LABELS: Record<string, string> = {
                        downloading: '⬇️ Đang tải...',
                        editing: '🎬 Đang chỉnh sửa...',
                        captioning: '✍️ Đang tạo caption...',
                        dedup: '🔍 Đang kiểm tra trùng...',
                        publishing: '📤 Đang đăng...',
                        checking_time: '⏰ Đang chờ lịch...',
                        scheduling: '📋 Đang lên lịch...',
                        scanning: '🔎 Đang quét...',
                        monitoring: '👁 Đang theo dõi...',
                    }
                    // Prefer instance-level label, fallback to phase-level
                    const label = (activeInstanceId && INSTANCE_LABELS[activeInstanceId]) || PHASE_LABELS[phase] || '⚡ Đang xử lý...'
                    return (
                        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider font-bold" style={{ color: sc.color }}>
                            <span className="animate-pulse">●</span> {label}
                        </div>
                    )
                })()}

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
                                    <a href={tiktokSourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-sky-500 hover:text-sky-600 font-bold transition" title="Xem video gốc trên TikTok">
                                        🔗 Nguồn
                                    </a>
                                )}
                                {video.published_url && (
                                    <a href={video.published_url} target="_blank" rel="noreferrer" className="text-[10px] text-purple-600 hover:text-purple-700 font-bold transition" title="Xem video đã đăng">
                                        📤 Đã đăng
                                    </a>
                                )}
                                {video.local_path && (
                                    <button className="text-[10px] text-slate-500 hover:text-slate-700 font-bold transition cursor-pointer"
                                        onClick={() => api.invoke('video:show-in-explorer', { path: video.local_path })}
                                        title="Mở thư mục chứa file" aria-label="Mở thư mục chứa file">
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
                                onClick={() => api?.invoke('captcha:resolve', { videoId: video.platform_id, campaignId })}>
                                Resolve CAPTCHA
                            </button>
                        )}

                        {/* Quick Retry button on VideoCard for failed publish statuses */}
                        {canRetry && video.status !== 'captcha' && (
                            <button
                                onClick={handleRetry}
                                disabled={retrying}
                                className="mt-1.5 w-full text-[10px] font-bold px-2 py-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                style={{
                                    background: retrying ? '#f1f5f9' : '#eff6ff',
                                    color: retrying ? '#94a3b8' : '#2563eb',
                                    borderColor: retrying ? '#e2e8f0' : '#bfdbfe',
                                }}
                            >
                                {retrying ? '⏳ Đang thử lại...' : '🔄 Thử lại đăng video'}
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
                        {historyExpanded ? 'Ẩn lịch sử' : 'Xem lịch sử'}
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
                <input type="text" placeholder="🔍 Lọc log..." value={filter} onChange={e => setFilter(e.target.value)}
                    className="w-full max-w-xs px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition text-slate-700 placeholder:text-slate-300" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {filtered.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">Chưa có log</p>
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
    const [rightTab, setRightTab] = useState<'pipeline' | 'logs'>('pipeline')
    const [pipelineExpanded, setPipelineExpanded] = useState(false)

    const sources = config.sources || []
    const gapMinutes = config.publishIntervalMinutes
    const phase = PHASE_UI[state.phase] || PHASE_UI.idle

    // Group-based counters — computed from video statuses
    const g = computeGroupTotals(
        state.videos.reduce((acc: Record<string, number>, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc }, {})
    )
    const percent = g.total > 0 ? Math.round((g.published / g.total) * 100) : 0

    // Per-source video counts (match by source_meta.source_name, fallback to author)
    const videosBySource = state.videos.reduce((acc: Record<string, TikTokVideo[]>, v) => {
        const sourceName = v.data?.source_meta?.source_name?.replace(/^@/, '').trim() || v.author || 'unknown'
        if (!acc[sourceName]) acc[sourceName] = []
        acc[sourceName].push(v)
        return acc
    }, {})

    // Human-readable scan condition builder
    const buildScanLabel = (s: any): string => {
        const parts: string[] = []
        if (s.minLikes) parts.push(`ít nhất ${Number(s.minLikes).toLocaleString()} likes`)
        if (s.minViews) parts.push(`ít nhất ${Number(s.minViews).toLocaleString()} lượt xem`)
        if (s.maxViews) parts.push(`tối đa ${Number(s.maxViews).toLocaleString()} lượt xem`)
        if (s.withinDays) parts.push(`trong ${s.withinDays} ngày gần nhất`)
        if (s.maxItemCount) parts.push(`tối đa ${s.maxItemCount} video`)
        return parts.length > 0 ? parts.join(', ') : 'Tất cả video'
    }

    return (
        <div className="flex flex-col h-full max-w-full gap-3">

            {/* ── PER-CHANNEL STATS STRIP ── */}
            {sources.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {sources.map((s: any, i: number) => {
                        const sv = videosBySource[s.name] || []
                        const sg = computeGroupTotals(
                            sv.reduce((acc: Record<string, number>, v: TikTokVideo) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc }, {})
                        )
                        return (
                            <div key={s.name || `src-${i}`} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm text-xs">
                                {s.avatar
                                    ? <img src={s.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                    : <span className="text-[11px] shrink-0">{s.type === 'channel' ? '📺' : '🔑'}</span>
                                }
                                <span className="font-semibold text-slate-700 max-w-[120px] truncate">{s.name}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-400">{sv.length} video</span>
                                {sg.published > 0 && <span className="text-emerald-600 font-bold">✓{sg.published}</span>}
                                {sg.submitted > 0 && <span className="text-amber-500 font-bold">⏳{sg.submitted}</span>}
                                {sg.queued > 0 && <span className="text-amber-600 font-bold">⏳{sg.queued}</span>}
                                {sg.failed > 0 && <span className="text-red-500 font-bold">✗{sg.failed}</span>}
                                {buildScanLabel(s) !== 'Tất cả video' && (
                                    <span className="text-[9px] text-slate-400 italic max-w-[160px] truncate" title={buildScanLabel(s)}>🔎 {buildScanLabel(s)}</span>
                                )}
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

            {/* ── PAUSE CHECKPOINT BANNER ── */}
            {state.phase === 'paused' && (() => {
                const cp = (campaign as any)?.meta?.runtime?.pauseCheckpoint
                if (!cp) return null
                const NODE_LABELS: Record<string, string> = {
                    'downloader_1': '⬇️ Tải video', 'video_edit_1': '🎬 Chỉnh sửa',
                    'caption_1': '✍️ Tạo caption', 'publisher_1': '📤 Đăng video',
                    'dedup_1': '🔍 Kiểm tra trùng', 'account_dedup_1': '🔍 Kiểm tra TK',
                    'check_time_1': '⏰ Chờ lịch', 'scanner_1': '🔎 Quét nguồn',
                    'monitor_1': '👁 Theo dõi',
                }
                const REASON_LABELS: Record<string, string> = {
                    manual: '⏸ Tạm dừng thủ công', event: '⚡ Dừng bởi sự kiện',
                    network: '🌐 Lỗi mạng', disk: '💾 Lỗi ổ đĩa',
                }
                const nodeLabel = cp.lastActiveChild ? (NODE_LABELS[cp.lastActiveChild] || cp.lastActiveChild) : ''
                const reason = REASON_LABELS[cp.reason] || cp.reason
                const video = cp.itemIndex != null ? `Video #${cp.itemIndex + 1}` : ''
                return (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 shrink-0 shadow-sm">
                        <span className="text-amber-600 text-sm shrink-0">📍</span>
                        <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-amber-800">{reason}</span>
                            {video && <span className="text-xs text-amber-600 ml-2">{video}</span>}
                            {nodeLabel && <span className="text-xs text-amber-500 ml-2">— {nodeLabel}</span>}
                            {cp.lastProgressMessage && (
                                <p className="text-[10px] text-amber-500 mt-0.5 truncate">{cp.lastProgressMessage}</p>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* ── SPLIT LAYOUT: Timeline (left 50%) | Pipeline/Sources/Logs (right 50%) ── */}
            <div className="flex gap-4 flex-1 min-h-0">

                {/* LEFT: Video Timeline — exactly 50% width, independent scroll */}
                <div className="w-[44%] min-w-[430px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">📋</span>
                            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Dòng thời gian</span>
                            <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-200 font-bold">{state.videos.length}</span>
                            {g.published > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">✓{g.published}</span>}
                            {g.failed > 0 && <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200 font-bold">✗{g.failed}</span>}
                        </div>
                        {/* Gap badge moved here — next to video count */}
                        {gapMinutes && <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">⏱ {gapMinutes} phút/video</span>}
                    </div>

                    {/* Independent scroll — only this panel scrolls, not the whole page */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                        {state.videos.length === 0 ? (
                            <div className="text-slate-400 text-sm text-center py-16 flex flex-col items-center gap-2">
                                <span className="text-3xl">📭</span>
                                Chưa có video. Chạy campaign để bắt đầu.
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
                                            const label = isToday ? 'Hôm nay' : isTomorrow ? `Ngày mai (${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })})` : d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

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
                                        elements.push(<VideoCard key={video.platform_id || i} video={video} index={i} campaignId={campaignId} phase={state.phase} activeInstanceId={state.activeInstanceId} />)
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
                        <SideTab active={rightTab === 'logs'} label="Nhật ký" icon="📃" onClick={() => setRightTab('logs')} />
                    </div>

                    <div className="flex-1 overflow-hidden min-h-0">
                        {rightTab === 'pipeline' && (
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm h-full overflow-auto animate-fade-in flex flex-col">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pipeline</span>
                                    <button
                                        onClick={() => setPipelineExpanded(true)}
                                        className="text-slate-400 hover:text-purple-600 p-1 rounded-lg hover:bg-purple-50 transition cursor-pointer text-xs"
                                        title="Mở toàn màn hình"
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
                                        width: '94vw', height: '92vh',
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

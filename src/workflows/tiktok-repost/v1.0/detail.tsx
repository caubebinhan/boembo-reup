/**
 * TikTok Repost — Campaign Detail View
 * 
 * This file OWNS all state for the TikTok Repost workflow:
 * - Scan progress (sources, video count)
 * - Video pipeline (scanned → downloaded → captioned → published)
 * - Per-video status tracking via execution logs
 * 
 * Core only provides raw IPC events — this file interprets them.
 */
import { useState, useEffect, useCallback } from 'react'
import { PipelineVisualizer } from '@renderer/detail/shared/PipelineVisualizer'
import type { WorkflowDetailProps } from '@renderer/detail/WorkflowDetailRegistry'

const fmt = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}

const parseVideoMeta = (raw: any) => {
    return raw && typeof raw === 'object' ? raw : {}
}

// ── TikTok Repost State ──────────────────────────────
interface TikTokVideo {
    platform_id: string
    description?: string
    author?: string
    thumbnail?: string
    stats?: { views?: number; likes?: number }
    local_path?: string
    caption?: string
    published_url?: string
    status: 'queued' | 'scanned' | 'downloading' | 'downloaded' | 'captioned' | 'publishing' | 'published' | 'verification_incomplete' | 'failed' | 'captcha' | 'violation' | 'skipped' | 'processing' | 'under_review' | 'verifying_publish' | 'duplicate'
    error?: string
    statusMessage?: string
    reviewRetry?: {
        attempts?: number
        maxRetries?: number
        nextRetryAt?: number
        predictedReviewMs?: number
        actualReviewMs?: number
    }
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
    phase: 'idle',
    videos: [],
    scannedCount: 0,
    queuedCount: 0,
    downloadedCount: 0,
    publishedCount: 0,
    failedCount: 0,
    publishFailedCount: 0,
    captchaCount: 0,
}

/**
 * Hook: TikTok Repost state from execution logs + live IPC events.
 * Only used inside this file — NOT a core hook.
 */
function useTikTokRepostState(campaignId: string): TikTokRepostState {
    const [state, setState] = useState<TikTokRepostState>(INITIAL)

    const rebuild = useCallback(async () => {
        try {
            // Fetch videos from DB (source of truth for counts + thumbnails)
            // @ts-ignore
            const dbVideos: any[] = await window.api.invoke('campaign:get-videos', { id: campaignId }) || []

            // Fetch logs for phase detection
            // @ts-ignore
            const logs: any[] = await window.api.invoke('campaign:get-logs', { id: campaignId, limit: 200 }) || []

            // Phase detection from logs
            let phase: TikTokRepostState['phase'] = 'idle'
            let phaseMessage = ''
            const sorted = [...logs].reverse()
            for (const log of sorted) {
                const nodeId = log.node_id || ''
                if (log.event === 'node:start' && nodeId.includes('scanner')) {
                    phase = 'scanning'; phaseMessage = 'Đang quét nguồn video...'
                }
                if (log.event === 'node:start' && nodeId.includes('scheduler')) {
                    phase = 'scheduling'; phaseMessage = 'Đang lên lịch publish...'
                }
                if (log.event === 'node:start' && nodeId.includes('downloader')) {
                    phase = 'downloading'; phaseMessage = 'Đang tải video...'
                }
                if (log.event === 'node:start' && nodeId.includes('publisher')) {
                    phase = 'publishing'; phaseMessage = 'Đang publish...'
                }
                if (log.event === 'node:start' && nodeId.includes('monitor')) {
                    phase = 'monitoring'; phaseMessage = 'Đang theo dõi video mới...'
                }
                if (log.event === 'campaign:finished') {
                    phase = 'finished'; phaseMessage = log.message || 'Hoàn tất'
                }
                if (log.event === 'campaign:paused') {
                    phase = 'paused'; phaseMessage = log.message || 'Đã tạm dừng'
                }
                if (log.event === 'campaign:error') {
                    phase = 'error'; phaseMessage = log.message || ''
                }
                if (log.event === 'node:progress') {
                    phaseMessage = log.message || phaseMessage
                }
            }

            // Build video list from DB
            const videos: TikTokVideo[] = dbVideos.map((v: any) => {
                const meta = parseVideoMeta(v.data)
                return {
                    platform_id: v.platform_id,
                    description: meta?.description || '',
                    author: meta?.author || '',
                    thumbnail: (() => {
                        const local = meta?.local_thumbnail
                        if (local) {
                            // Replace backslashes only — no encoding needed for custom protocol
                            return `local-thumb://${local.replace(/\\/g, '/')}`
                        }
                        return typeof meta?.thumbnail === 'string' ? meta.thumbnail : ''
                    })(),
                    stats: meta?.stats,
                    local_path: v.local_path,
                    // Prefer generated_caption (post-template transform), fall back to original description
                    caption: meta?.generated_caption || meta?.description || '',
                    published_url: v.publish_url,
                    status: mapDbStatus(v.status),
                    error: undefined,
                    scheduledAt: v.scheduled_for || undefined,
                    queueIndex: v.queue_index ?? undefined,
                }
            })


            setState(prev => ({
                phase,
                phaseMessage,
                videos: videos.map(v => {
                    const prevVideo = prev.videos.find(p => p.platform_id === v.platform_id)
                    return {
                        ...v,
                        isActive: v.platform_id === prev.activeVideoId,
                        statusMessage: prevVideo?.statusMessage,
                        reviewRetry: prevVideo?.reviewRetry,
                    }
                }),
                scannedCount: videos.length,
                queuedCount: videos.filter(v => v.status === 'queued').length,
                downloadedCount: videos.filter(v => ['downloaded', 'captioned', 'publishing', 'published', 'verification_incomplete'].includes(v.status)).length,
                publishedCount: videos.filter(v => ['published', 'verification_incomplete'].includes(v.status)).length,
                failedCount: videos.filter(v => v.status === 'failed').length,
                publishFailedCount: videos.filter(v => v.status === 'failed' && v.local_path).length,
                captchaCount: videos.filter(v => v.status === 'captcha').length,
                activeVideoId: prev.activeVideoId,
            }))
        } catch (err) {
            console.error('[TikTokRepostDetail] Failed to rebuild state:', err)
        }
    }, [campaignId])

    useEffect(() => {
        rebuild()
        const timer = setInterval(rebuild, 3000)

        // Live updates trigger rebuild
        // @ts-ignore
        const offData = window.api?.on('execution:node-data', (ev: any) => {
            if (ev.campaignId !== campaignId) return
            rebuild()
        })
        // @ts-ignore
        const offProgress = window.api?.on('node:progress', (ev: any) => {
            if (ev.campaignId !== campaignId) return
            setState(prev => ({ ...prev, phaseMessage: ev.message }))
        })
        // @ts-ignore — workflow-specific node events (captcha, active video, etc.)
        const offNodeEvent = window.api?.on('node:event', (ev: any) => {
            if (ev.campaignId !== campaignId) return
            if (ev.event === 'video:active') {
                setState(prev => ({
                    ...prev,
                    activeVideoId: ev.data?.videoId,
                    videos: prev.videos.map(v => ({ ...v, isActive: v.platform_id === ev.data?.videoId })),
                }))
            } else if (ev.event === 'captcha:detected') {
                setState(prev => ({
                    ...prev,
                    videos: prev.videos.map(v =>
                        v.platform_id === ev.data?.videoId ? { ...v, status: 'captcha' as const } : v
                    ),
                    captchaCount: prev.captchaCount + 1,
                }))
            } else if (ev.event === 'violation:detected') {
                setState(prev => ({
                    ...prev,
                    videos: prev.videos.map(v =>
                        v.platform_id === ev.data?.videoId ? { ...v, status: 'violation' as const, error: ev.data?.error } : v
                    ),
                }))
            } else if (ev.event === 'video:published') {
                rebuild()  // full rebuild to pick up updated DB state
            } else if (ev.event === 'video:publish-status') {
                setState(prev => ({
                    ...prev,
                    videos: prev.videos.map(v =>
                        v.platform_id === ev.data?.videoId
                            ? {
                                ...v,
                                status: (ev.data?.status || v.status) as TikTokVideo['status'],
                                published_url: ev.data?.videoUrl || v.published_url,
                                statusMessage: ev.data?.message || v.statusMessage,
                                reviewRetry: {
                                    attempts: ev.data?.attempts,
                                    maxRetries: ev.data?.maxRetries,
                                    nextRetryAt: ev.data?.nextRetryAt,
                                    predictedReviewMs: ev.data?.predictedReviewMs,
                                    actualReviewMs: ev.data?.actualReviewMs,
                                },
                            }
                            : v
                    ),
                }))
            } else if (ev.event === 'video:duplicate-detected') {
                setState(prev => ({
                    ...prev,
                    videos: prev.videos.map(v =>
                        v.platform_id === ev.data?.videoId
                            ? {
                                ...v,
                                status: 'duplicate' as const,
                                published_url: ev.data?.existingVideoUrl || v.published_url,
                                statusMessage: `Duplicate on @${ev.data?.accountUsername || 'unknown'} (${ev.data?.matchedBy || 'match'})${ev.data?.existingVideoUrl ? ` — ${ev.data.existingVideoUrl}` : ''}`,
                            }
                            : v
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

function mapDbStatus(dbStatus: string): TikTokVideo['status'] {
    const map: Record<string, TikTokVideo['status']> = {
        queued: 'queued',
        pending: 'queued',
        scanned: 'scanned',
        processing: 'downloading',
        downloaded: 'downloaded',
        published: 'published',
        verification_incomplete: 'verification_incomplete',
        under_review: 'under_review',
        verifying_publish: 'verifying_publish',
        duplicate: 'duplicate',
        failed: 'failed',
        verified: 'published',
        captcha: 'captcha',
        violation: 'violation',
        skipped: 'skipped',
    }
    return map[dbStatus] || 'queued'
}

// ── UI Components (TikTok-specific) ─────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    queued: { label: 'QUEUED', color: '#eab308', bg: '#eab30815' },
    scanned: { label: 'SCANNED', color: '#a855f7', bg: '#a855f715' },
    downloading: { label: 'DOWNLOADING', color: '#3b82f6', bg: '#3b82f615' },
    downloaded: { label: 'DOWNLOADED', color: '#06b6d4', bg: '#06b6d415' },
    captioned: { label: 'CAPTIONED', color: '#0ea5e9', bg: '#0ea5e915' },
    publishing: { label: 'PUBLISHING', color: '#8b5cf6', bg: '#8b5cf615' },
    published: { label: 'PUBLISHED', color: '#10b981', bg: '#10b98115' },
    verification_incomplete: { label: 'VERIFY UNKNOWN', color: '#f59e0b', bg: '#f59e0b15' },
    under_review: { label: 'UNDER REVIEW', color: '#f59e0b', bg: '#f59e0b15' },
    verifying_publish: { label: 'VERIFYING', color: '#22c55e', bg: '#22c55e15' },
    duplicate: { label: 'DUPLICATE', color: '#f97316', bg: '#f9731615' },
    failed: { label: 'FAILED', color: '#ef4444', bg: '#ef444415' },
    captcha: { label: '⚠️ CAPTCHA', color: '#f97316', bg: '#f9731615' },
    violation: { label: 'VIOLATION', color: '#dc2626', bg: '#dc262615' },
    skipped: { label: 'SKIPPED', color: '#9ca3af', bg: '#9ca3af15' },
    processing: { label: 'PROCESSING', color: '#f59e0b', bg: '#f59e0b15' },
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
    return (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-800 bg-gray-900/50">
            <span className="text-lg">{icon}</span>
            <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
            </div>
        </div>
    )
}

function VideoCard({ video, index, campaignId }: { video: TikTokVideo; index: number; campaignId: string; gapMinutes?: number }) {
    const api = (window as any).api
    const sc = STATUS_CONFIG[video.status] || STATUS_CONFIG.queued
    const isActive = video.isActive
    const scheduledTime = video.scheduledAt
        ? new Date(video.scheduledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : null

    return (
        <div className="relative pl-8 pb-6" style={{ opacity: video.status === 'skipped' ? 0.5 : 1 }}>
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-800" />
            <div
                className={`absolute left-1.5 top-2.5 w-3 h-3 rounded-full border-2 border-gray-900 ${['downloading', 'publishing', 'under_review', 'verifying_publish'].includes(video.status) || isActive ? 'animate-pulse' : ''}`}
                style={{
                    backgroundColor: sc.color,
                    boxShadow: isActive ? `0 0 10px ${sc.color}, 0 0 20px ${sc.color}40` : 'none',
                }}
            />


            <div
                className={`rounded-xl p-4 transition-all ${isActive
                    ? 'bg-gray-900/80 border-2'
                    : 'bg-gray-900/60 border border-gray-800 hover:border-gray-700'
                    }`}
                style={{
                    borderColor: isActive ? sc.color : undefined,
                    boxShadow: isActive ? `0 0 16px ${sc.color}20` : undefined,
                }}
            >
                {/* Active indicator */}
                {isActive && (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider" style={{ color: sc.color }}>
                        <span className="animate-pulse">●</span> Publishing now...
                    </div>
                )}

                <div className="flex items-start gap-4">
                    {video.thumbnail ? (
                        <img src={video.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-800"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-2xl flex-shrink-0">🎬</div>
                    )}

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-1.5">
                            <div className="flex items-center gap-2">
                                {scheduledTime && (
                                    <div className="group relative">
                                        <input
                                            type="time"
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                            onChange={async (e) => {
                                                const [h, m] = e.target.value.split(':').map(Number)
                                                const newDate = new Date(video.scheduledAt!)
                                                newDate.setHours(h, m, 0, 0)
                                                await api.invoke('video:reschedule', {
                                                    platformId: video.platform_id,
                                                    campaignId,
                                                    scheduledFor: newDate.getTime()
                                                })
                                            }}
                                        />
                                        <span className="text-[10px] font-mono bg-black/40 text-gray-400 px-2 py-0.5 rounded border border-gray-800 group-hover:border-purple-500/50 group-hover:text-purple-400 transition cursor-pointer">
                                            🕒 {scheduledTime}
                                        </span>
                                    </div>
                                )}
                                <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded" style={{ color: sc.color, backgroundColor: sc.bg }}>
                                    {sc.label}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                {video.author && (
                                    <span className="text-[10px] text-gray-500 font-medium">@{video.author}</span>
                                )}
                                <span className="text-[10px] text-gray-600 font-mono">#{index + 1}</span>
                            </div>
                        </div>

                        <p className="text-sm text-gray-300 line-clamp-1 mb-2 font-medium">
                            {video.caption || video.description || 'Untitled Video'}
                        </p>

                        <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-medium">
                                {video.stats?.views != null && <span className="flex items-center gap-1">👁 {fmt(video.stats.views)}</span>}
                                {video.stats?.likes != null && <span className="flex items-center gap-1">❤ {fmt(video.stats.likes)}</span>}
                                {video.local_path && <span className="text-green-500 flex items-center gap-1">✓ Downloaded</span>}
                            </div>

                            <div className="flex items-center gap-2">
                                {video.local_path && (
                                    <button
                                        className="text-[10px] text-cyan-500 hover:text-cyan-400 font-bold tracking-wider uppercase transition cursor-pointer"
                                        onClick={() => api.invoke('video:show-in-explorer', { path: video.local_path })}
                                    >
                                        📂 Open
                                    </button>
                                )}
                                {video.published_url && (
                                    <a href={video.published_url} target="_blank" rel="noreferrer" className="text-[10px] text-purple-400 hover:text-purple-300 font-bold tracking-wider uppercase">
                                        🔗 Link
                                    </a>
                                )}
                            </div>
                        </div>

                        {video.error && (
                            <p className="text-[10px] text-red-400 mt-2 bg-red-500/10 rounded px-2 py-1 leading-relaxed border border-red-500/20">
                                ⚠ {video.error}
                            </p>
                        )}

                        {video.statusMessage && (video.status === 'under_review' || video.status === 'verifying_publish' || video.status === 'verification_incomplete' || video.status === 'duplicate') && (
                            <p className={`text-[10px] mt-2 rounded px-2 py-1 leading-relaxed border ${video.status === 'duplicate'
                                ? 'text-orange-300 bg-orange-500/10 border-orange-500/20'
                                : video.status === 'verification_incomplete'
                                    ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'
                                    : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                                }`}>
                                {video.statusMessage}
                                {video.reviewRetry?.nextRetryAt && video.status === 'under_review' && (
                                    <span className="text-amber-200/80">
                                        {' '}Next check: {new Date(video.reviewRetry.nextRetryAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </p>
                        )}

                        {video.status === 'captcha' && (
                            <button
                                className="mt-2 w-full text-[10px] font-bold px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600 transition uppercase tracking-wider shadow-lg shadow-orange-500/20"
                                onClick={() => api?.send('captcha:resolve', { videoId: video.platform_id, campaignId })}
                            >
                                Resolve CAPTCHA
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div >
    )
}

// ── Execution Log Viewer ────────────────────────────
function ExecutionLogs({ campaignId }: { campaignId: string }) {
    const [logs, setLogs] = useState<any[]>([])
    const [collapsed, setCollapsed] = useState(true)

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

    const levelColors: Record<string, string> = {
        info: '#9ca3af', warn: '#eab308', error: '#ef4444', debug: '#6b7280'
    }

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30">
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/30 transition rounded-xl"
            >
                <span className="text-[10px] uppercase tracking-wider text-gray-600">📃 Execution Logs ({logs.length})</span>
                <span className="text-gray-600 text-xs">{collapsed ? '▶' : '▼'}</span>
            </button>
            {!collapsed && (
                <div className="px-4 pb-3 max-h-[400px] overflow-y-auto">
                    {logs.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-4">No logs yet</p>
                    ) : (
                        <div className="space-y-0.5 font-mono text-[11px]">
                            {logs.map((log, i) => (
                                <div key={i} className="flex gap-2 py-0.5 hover:bg-gray-800/30 px-1 rounded">
                                    <span className="text-gray-700 shrink-0 w-[65px]">
                                        {new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    <span className="shrink-0 w-[45px] uppercase font-bold" style={{ color: levelColors[log.level] || '#6b7280' }}>
                                        {log.level}
                                    </span>
                                    <span className="text-blue-400/60 shrink-0 w-[85px] truncate">{log.instance_id || log.node_id || ''}</span>
                                    <span className="text-gray-400 truncate flex-1">{log.message}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main Component ──────────────────────────────────

const PHASE_UI: Record<string, { label: string; icon: string; color: string }> = {
    idle: { label: 'Sẵn sàng chạy', icon: '⏸', color: '#6b7280' },
    scanning: { label: 'Đang quét nguồn...', icon: '🔍', color: '#8b5cf6' },
    scheduling: { label: 'Đang lên lịch...', icon: '📋', color: '#eab308' },
    downloading: { label: 'Đang tải video...', icon: '⬇️', color: '#3b82f6' },
    publishing: { label: 'Đang publish...', icon: '📤', color: '#10b981' },
    monitoring: { label: 'Đang theo dõi video mới...', icon: '👁', color: '#06b6d4' },
    paused: { label: 'Đã tạm dừng', icon: '⏸', color: '#eab308' },
    finished: { label: 'Hoàn tất', icon: '✅', color: '#10b981' },
    error: { label: 'Lỗi', icon: '❌', color: '#ef4444' },
}

function TikTokRepostDetail({ campaignId, campaign, workflowId }: WorkflowDetailProps) {
    const state = useTikTokRepostState(campaignId)
    const config = campaign?.params || {}

    const sources = config.sources || []
    const gapMinutes = config.intervalMinutes
    const phase = PHASE_UI[state.phase] || PHASE_UI.idle

    return (
        <div className="space-y-5">
            {/* Phase Banner */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                style={{ borderColor: `${phase.color}30`, backgroundColor: `${phase.color}08` }}>
                <span className={`text-lg ${['scanning', 'downloading', 'publishing'].includes(state.phase) ? 'animate-bounce' : ''}`}>
                    {phase.icon}
                </span>
                <div>
                    <span className="font-semibold text-white text-sm">{phase.label}</span>
                    {state.phaseMessage && <span className="text-xs text-gray-400 ml-2">{state.phaseMessage}</span>}
                </div>
            </div>

            {/* Stats */}
            <div className="flex gap-3 flex-wrap">
                <StatCard icon="🔍" label="Đã quét" value={state.scannedCount} color="#8b5cf6" />
                <StatCard icon="📋" label="Chờ xử lý" value={state.queuedCount} color="#eab308" />
                <StatCard icon="⬇️" label="Đã tải" value={state.downloadedCount} color="#3b82f6" />
                <StatCard icon="📤" label="Đã publish" value={state.publishedCount} color="#10b981" />
                <StatCard icon="💥" label="Publish lỗi" value={state.publishFailedCount} color="#ef4444" />
                {state.captchaCount > 0 && <StatCard icon="⚠️" label="CAPTCHA" value={state.captchaCount} color="#f97316" />}
            </div>

            {/* Pipeline */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Pipeline</p>
                <PipelineVisualizer campaignId={campaignId} workflowId={workflowId} />
            </div>

            {/* Source Summary */}
            {sources.length > 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">📡 Sources</p>
                    <div className="flex flex-col gap-2">
                        {sources.map((s: any, i: number) => {
                            const count = state.videos.filter(v => {
                                const meta = (v as any).source_meta || {}
                                return meta.source_name === s.name
                            }).length
                            const filters: string[] = []
                            if (s.minLikes) filters.push(`≥${s.minLikes} likes`)
                            if (s.minViews) filters.push(`≥${s.minViews} views`)
                            if (s.maxViews) filters.push(`≤${s.maxViews} views`)
                            if (s.withinDays) filters.push(`${s.withinDays}d`)
                            return (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                                        {s.type === 'channel' ? '📺' : '🔑'} {s.name}
                                        {count > 0 && <span className="ml-1.5 text-purple-400 font-bold">({count})</span>}
                                    </span>
                                    {filters.length > 0 && (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                            🔍 {filters.join(' · ')}
                                        </span>
                                    )}
                                    {s.autoSchedule === false && (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                            ✋ Manual
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                        <span className="text-xs px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 self-start">
                            Tổng: {state.scannedCount} videos
                        </span>
                    </div>
                </div>
            )}

            {/* Video Timeline */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-gray-600">📋 Video Timeline</p>
                    {gapMinutes && <span className="text-[10px] text-gray-600">⏱ Gap: {gapMinutes}min</span>}
                </div>
                {state.videos.length === 0 ? (
                    <div className="text-gray-600 text-sm text-center py-8">
                        No videos yet. Run the campaign to start scanning.
                    </div>
                ) : (
                    <div className="max-h-[600px] overflow-y-auto pr-2">
                        {(() => {
                            const sorted = [...state.videos].sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0))
                            const now = new Date()
                            const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
                            const tomorrow = new Date(now)
                            tomorrow.setDate(tomorrow.getDate() + 1)
                            const tomorrowKey = `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`

                            let lastDateKey = ''
                            const elements: React.ReactNode[] = []

                            for (let i = 0; i < sorted.length; i++) {
                                const video = sorted[i]
                                const d = video.scheduledAt ? new Date(video.scheduledAt) : null
                                const dateKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'unknown'

                                if (dateKey !== lastDateKey && d) {
                                    let label: string
                                    if (dateKey === todayKey) {
                                        label = 'Today'
                                    } else if (dateKey === tomorrowKey) {
                                        label = `Tomorrow (${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })})`
                                    } else {
                                        label = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
                                    }

                                    const isToday = dateKey === todayKey
                                    const isTomorrow = dateKey === tomorrowKey

                                    elements.push(
                                        <div
                                            key={`date-${dateKey}`}
                                            className="sticky top-0 z-10 flex items-center gap-2 py-2 mb-1"
                                            style={{ backdropFilter: 'blur(12px)' }}
                                        >
                                            <div className="h-px flex-1 bg-gray-700/50" />
                                            <span
                                                className="text-[11px] font-semibold px-3 py-1 rounded-full shrink-0"
                                                style={{
                                                    background: isToday ? '#3b82f620' : isTomorrow ? '#8b5cf620' : '#374151',
                                                    color: isToday ? '#60a5fa' : isTomorrow ? '#a78bfa' : '#9ca3af',
                                                    border: `1px solid ${isToday ? '#3b82f630' : isTomorrow ? '#8b5cf630' : '#4b5563'}`,
                                                }}
                                            >
                                                {isToday && '📅 '}{isTomorrow && '📆 '}{label}
                                            </span>
                                            <div className="h-px flex-1 bg-gray-700/50" />
                                        </div>
                                    )
                                    lastDateKey = dateKey
                                }

                                elements.push(
                                    <VideoCard key={video.platform_id || i} video={video} index={i} gapMinutes={gapMinutes} campaignId={campaignId} />
                                )
                            }
                            return elements
                        })()}
                    </div>
                )}
            </div>

            {/* Execution Logs */}
            <ExecutionLogs campaignId={campaignId} />
        </div>
    )
}

export default TikTokRepostDetail

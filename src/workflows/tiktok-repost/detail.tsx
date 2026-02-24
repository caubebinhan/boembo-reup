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
    status: 'scanned' | 'downloading' | 'downloaded' | 'captioned' | 'publishing' | 'published' | 'failed'
    error?: string
    scheduledAt?: number
}

interface TikTokRepostState {
    phase: 'idle' | 'scanning' | 'downloading' | 'publishing' | 'finished' | 'error'
    phaseMessage?: string
    videos: TikTokVideo[]
    scannedCount: number
    downloadedCount: number
    publishedCount: number
    failedCount: number
}

const INITIAL: TikTokRepostState = {
    phase: 'idle',
    videos: [],
    scannedCount: 0,
    downloadedCount: 0,
    publishedCount: 0,
    failedCount: 0,
}

/**
 * Hook: TikTok Repost state from execution logs + live IPC events.
 * Only used inside this file — NOT a core hook.
 */
function useTikTokRepostState(campaignId: string): TikTokRepostState {
    const [state, setState] = useState<TikTokRepostState>(INITIAL)

    const rebuild = useCallback(async () => {
        try {
            // @ts-ignore
            const logs: any[] = await window.api.invoke('campaign:get-logs', { id: campaignId, limit: 500 })
            if (!logs?.length) return

            const videoMap = new Map<string, TikTokVideo>()
            let phase: TikTokRepostState['phase'] = 'idle'
            let phaseMessage = ''

            // Process chronologically (oldest first)
            const sorted = [...logs].reverse()
            for (const log of sorted) {
                const nodeId = log.node_id || ''
                const data = log.data_json ? tryParse(log.data_json) : null

                // Phase detection
                if (log.event === 'node:start' && nodeId.includes('scanner')) {
                    phase = 'scanning'; phaseMessage = 'Scanning sources...'
                }
                if (log.event === 'node:start' && nodeId.includes('downloader')) {
                    phase = 'downloading'; phaseMessage = 'Downloading videos...'
                }
                if (log.event === 'node:start' && nodeId.includes('publisher')) {
                    phase = 'publishing'; phaseMessage = 'Publishing...'
                }
                if (log.event === 'campaign:finished') {
                    phase = 'finished'; phaseMessage = log.message || ''
                }
                if (log.event === 'node:error') {
                    phase = 'error'; phaseMessage = log.message || ''
                }

                // Extract video data from scanner results
                if (log.event === 'node:end' && nodeId.includes('scanner') && data?.resultSummary) {
                    // Scanner completed — scanned videos come from node-data events
                }

                // Progress messages
                if (log.event === 'node:progress') {
                    phaseMessage = log.message || phaseMessage
                }
            }

            // Build video list from any structured data in logs
            for (const log of sorted) {
                const data = log.data_json ? tryParse(log.data_json) : null
                if (!data) continue

                // Scanner log with video data
                if (data.inputSummary && Array.isArray(data.inputSummary)) {
                    for (const v of data.inputSummary) {
                        if (v.platform_id && !videoMap.has(v.platform_id)) {
                            videoMap.set(v.platform_id, {
                                platform_id: v.platform_id,
                                description: v.description,
                                author: v.author,
                                thumbnail: v.thumbnail,
                                stats: v.stats,
                                status: 'scanned',
                            })
                        }
                    }
                }
            }

            const videos = Array.from(videoMap.values())

            setState({
                phase,
                phaseMessage,
                videos,
                scannedCount: videos.length,
                downloadedCount: videos.filter(v => ['downloaded', 'captioned', 'publishing', 'published'].includes(v.status)).length,
                publishedCount: videos.filter(v => v.status === 'published').length,
                failedCount: videos.filter(v => v.status === 'failed').length,
            })
        } catch (err) {
            console.error('[TikTokRepostDetail] Failed to rebuild state:', err)
        }
    }, [campaignId])

    useEffect(() => {
        rebuild()
        const timer = setInterval(rebuild, 3000)

        // Live updates from node-data events
        // @ts-ignore
        const offData = window.api?.on('execution:node-data', (ev: any) => {
            if (ev.campaignId !== campaignId) return
            rebuild() // Re-derive state from logs
        })
        // @ts-ignore
        const offProgress = window.api?.on('node:progress', (ev: any) => {
            if (ev.campaignId !== campaignId) return
            setState(prev => ({ ...prev, phaseMessage: ev.message }))
        })

        return () => {
            clearInterval(timer)
            if (typeof offData === 'function') offData()
            if (typeof offProgress === 'function') offProgress()
        }
    }, [campaignId, rebuild])

    return state
}

// ── UI Components (TikTok-specific) ─────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    scanned: { label: 'QUEUED', color: '#eab308', bg: '#eab30815' },
    downloading: { label: 'DOWNLOADING', color: '#3b82f6', bg: '#3b82f615' },
    downloaded: { label: 'DOWNLOADED', color: '#06b6d4', bg: '#06b6d415' },
    captioned: { label: 'CAPTIONED', color: '#0ea5e9', bg: '#0ea5e915' },
    publishing: { label: 'PUBLISHING', color: '#8b5cf6', bg: '#8b5cf615' },
    published: { label: 'PUBLISHED', color: '#10b981', bg: '#10b98115' },
    failed: { label: 'FAILED', color: '#ef4444', bg: '#ef444415' },
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

function VideoCard({ video, index, gapMinutes }: { video: TikTokVideo; index: number; gapMinutes?: number }) {
    const sc = STATUS_CONFIG[video.status] || STATUS_CONFIG.scanned
    const scheduledTime = video.scheduledAt
        ? new Date(video.scheduledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : gapMinutes
            ? (() => {
                const t = new Date(Date.now() + index * gapMinutes * 60000)
                return t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            })()
            : null

    return (
        <div className="relative pl-8 pb-6">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-800" />
            <div
                className={`absolute left-1.5 top-2.5 w-3 h-3 rounded-full border-2 border-gray-900 ${['downloading', 'publishing'].includes(video.status) ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: sc.color }}
            />
            {scheduledTime && (
                <span className="absolute -left-[3px] top-7 text-[10px] text-gray-600 w-[34px] text-center">
                    {scheduledTime}
                </span>
            )}

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all">
                <div className="flex items-start gap-3">
                    {video.thumbnail ? (
                        <img src={video.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-800" />
                    ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-2xl flex-shrink-0">🎬</div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            {video.author && (
                                <span className="text-xs text-gray-500">👤 @{video.author}</span>
                            )}
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto shrink-0"
                                style={{ color: sc.color, backgroundColor: sc.bg }}>
                                {sc.label}
                            </span>
                        </div>
                        <p className="text-sm text-gray-300 line-clamp-2 mb-1.5">
                            {video.caption || video.description || 'Untitled Video'}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-gray-600">
                            {video.stats?.views != null && <span>👁 {fmt(video.stats.views)}</span>}
                            {video.stats?.likes != null && <span>❤ {fmt(video.stats.likes)}</span>}
                            {video.local_path && <span className="text-green-600">✓ Downloaded</span>}
                            {video.published_url && (
                                <a href={video.published_url} className="text-purple-400 hover:underline" target="_blank" rel="noreferrer">🔗 View</a>
                            )}
                        </div>
                        {video.error && (
                            <p className="text-xs text-red-400 mt-1 bg-red-500/10 rounded px-2 py-1">⚠ {video.error}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
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
    idle: { label: 'Ready to Run', icon: '⏸', color: '#6b7280' },
    scanning: { label: 'Scanning Sources...', icon: '🔍', color: '#8b5cf6' },
    downloading: { label: 'Downloading Videos...', icon: '⬇️', color: '#3b82f6' },
    publishing: { label: 'Publishing...', icon: '📤', color: '#10b981' },
    finished: { label: 'Completed', icon: '✅', color: '#10b981' },
    error: { label: 'Error', icon: '❌', color: '#ef4444' },
}

function TikTokRepostDetail({ campaignId, campaign, workflowId }: WorkflowDetailProps) {
    const state = useTikTokRepostState(campaignId)
    const config = (() => {
        try { return typeof campaign?.params === 'string' ? JSON.parse(campaign.params) : (campaign?.params || {}) }
        catch { return {} }
    })()

    const sources = config.sources || []
    const gapMinutes = config.schedule?.interval_minutes || config.gap_minutes
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
            <div className="flex gap-3">
                <StatCard icon="🔍" label="Scanned" value={state.scannedCount} color="#8b5cf6" />
                <StatCard icon="⬇️" label="Downloaded" value={state.downloadedCount} color="#3b82f6" />
                <StatCard icon="📤" label="Published" value={state.publishedCount} color="#10b981" />
                {state.failedCount > 0 && <StatCard icon="❌" label="Failed" value={state.failedCount} color="#ef4444" />}
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
                    <div className="flex flex-wrap gap-2">
                        {sources.map((s: any, i: number) => (
                            <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                                {s.type === 'channel' ? '📺' : '🔑'} {s.name}
                            </span>
                        ))}
                        <span className="text-xs px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            {state.scannedCount} videos found
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
                        {state.videos.map((video, i) => (
                            <VideoCard key={video.platform_id || i} video={video} index={i} gapMinutes={gapMinutes} />
                        ))}
                    </div>
                )}
            </div>

            {/* Execution Logs */}
            <ExecutionLogs campaignId={campaignId} />
        </div>
    )
}

// ── Helpers ─────────────────────────────────────────
function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return String(n)
}

function tryParse(json: string): any {
    try { return JSON.parse(json) }
    catch { return null }
}

export default TikTokRepostDetail

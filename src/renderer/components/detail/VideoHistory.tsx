/**
 * VideoHistory — Rich per-video event timeline
 * ──────────────────────────────────────────────
 * Shows a vertical timeline of all events for a specific video:
 * download (file size, duration), edit (filters, time), caption (before → after),
 * publish (time, URL), retry info, errors with inline retry button.
 *
 * Supports realtime refresh via IPC `execution:log` events.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'

interface VideoEvent {
    event: string
    message: string
    data: string | null
    created_at: string
    node_id?: string
    instance_id?: string
}

interface VideoHistoryProps {
    campaignId: string
    videoId: string        // platform_id
    isExpanded: boolean
}

// ── Node labels for Vietnamese display ──
const NODE_LABELS: Record<string, { icon: string; label: string }> = {
    'core.downloader': { icon: '⬇️', label: 'Tải video' },
    'core.video_scheduler': { icon: '📅', label: 'Lên lịch' },
    'core.video_edit': { icon: '🎬', label: 'Chỉnh sửa' },
    'core.caption_gen': { icon: '✍️', label: 'Caption' },
    'tiktok.publisher': { icon: '📤', label: 'Đăng TikTok' },
    'tiktok.account_dedup': { icon: '🔍', label: 'Kiểm tra trùng' },
    'core.deduplicator': { icon: '🔍', label: 'Kiểm tra trùng' },
    'core.check_in_time': { icon: '⏰', label: 'Chờ lịch' },
    'tiktok.scanner': { icon: '🔎', label: 'Quét video' },
    'core.monitoring': { icon: '👁', label: 'Theo dõi' },
    'core.condition': { icon: '🔀', label: 'Điều kiện' },
}

// ── Event type → display config ──
const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    // Download
    'video:queued': { icon: '📋', label: 'Đã xếp hàng', color: '#64748b' },
    'video:downloading': { icon: '⬇️', label: 'Đang tải video', color: '#3b82f6' },
    'video:downloaded': { icon: '✅', label: 'Tải xong', color: '#059669' },
    // Edit
    'video:editing': { icon: '🎬', label: 'Đang chỉnh sửa', color: '#8b5cf6' },
    'video:edited': { icon: '✅', label: 'Chỉnh sửa xong', color: '#059669' },
    'video-edit:started': { icon: '🎬', label: 'Đang chỉnh sửa video', color: '#8b5cf6' },
    'video-edit:completed': { icon: '✅', label: 'Chỉnh sửa xong', color: '#059669' },
    'video-edit:failed': { icon: '❌', label: 'Lỗi chỉnh sửa video', color: '#dc2626' },
    'video-edit:operation-applied': { icon: '⚙️', label: 'Áp dụng filter', color: '#7c3aed' },
    // Caption
    'caption:transformed': { icon: '✍️', label: 'Đã tạo caption', color: '#0891b2' },
    // Scheduler
    'scheduler:scheduled': { icon: '📅', label: 'Đã lên lịch', color: '#6366f1' },
    'scheduler:rescheduled': { icon: '🔄', label: 'Đã đổi lịch', color: '#d97706' },
    // Publish
    'video:active': { icon: '📤', label: 'Đang đăng', color: '#f59e0b' },
    'video:published': { icon: '🎉', label: 'Đã đăng thành công', color: '#059669' },
    'video:publish-status': { icon: '🔄', label: 'Cập nhật trạng thái', color: '#6366f1' },
    'publish:debug': { icon: '🐛', label: 'Debug upload', color: '#94a3b8' },
    // Errors
    'violation:detected': { icon: '🚫', label: 'Đăng thất bại', color: '#dc2626' },
    'captcha:detected': { icon: '⚠️', label: 'CAPTCHA', color: '#ea580c' },
    'session:expired': { icon: '🔑', label: 'Phiên hết hạn', color: '#dc2626' },
    'video:duplicate-detected': { icon: '♻️', label: 'Video trùng', color: '#d97706' },
    'video:failed': { icon: '❌', label: 'Thất bại', color: '#dc2626' },
    'video:skipped': { icon: '⏭️', label: 'Đã bỏ qua', color: '#64748b' },
    // Node lifecycle
    'node:start': { icon: '▶️', label: 'Bắt đầu xử lý', color: '#3b82f6' },
    'node:end': { icon: '⏹️', label: 'Hoàn tất', color: '#059669' },
    'node:error': { icon: '❌', label: 'Lỗi node', color: '#dc2626' },
    'node:progress': { icon: '⏳', label: 'Đang xử lý', color: '#6b7280' },
    // System
    'pipeline:info': { icon: '📢', label: 'Hệ thống', color: '#64748b' },
    'pipeline:manual-retry': { icon: '🔄', label: 'Thử lại (thủ công)', color: '#3b82f6' },
}
const DEFAULT_EVENT = { icon: '📝', label: 'Sự kiện', color: '#6b7280' }

function resolveEventConfig(event: string): { icon: string; label: string; color: string } {
    if (EVENT_CONFIG[event]) return EVENT_CONFIG[event]
    // Strip node:event: prefix and re-lookup
    if (event.startsWith('node:event:')) {
        const inner = event.slice('node:event:'.length)
        if (EVENT_CONFIG[inner]) return EVENT_CONFIG[inner]
    }
    return DEFAULT_EVENT
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

function formatTime(dateStr: string): { time: string; date: string } {
    const d = new Date(dateStr)
    return {
        time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    }
}

/** Render rich context for specific event types */
function RichEventData({ event, data }: { event: string; data: any }) {
    if (!data) return null
    const inner = event.startsWith('node:event:') ? event.slice('node:event:'.length) : event

    // Downloaded — file size + download time
    if (inner === 'video:downloaded' && data.fileSizeMB != null) {
        return (
            <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                    📦 {data.fileSizeMB} MB
                </span>
                {data.downloadDurationMs != null && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-100">
                        ⏱ {formatDuration(data.downloadDurationMs)}
                    </span>
                )}
            </div>
        )
    }

    // Caption — before → after
    if (inner === 'caption:transformed' && (data.original || data.generated)) {
        return (
            <div className="mt-1.5 space-y-1 text-[10px]">
                {data.original && (
                    <div className="flex gap-1">
                        <span className="text-slate-400 shrink-0">Gốc:</span>
                        <span className="text-slate-500 truncate">{data.original}</span>
                    </div>
                )}
                {data.generated && (
                    <div className="flex gap-1">
                        <span className="text-emerald-500 shrink-0">Đăng:</span>
                        <span className="text-emerald-600 truncate font-medium">{data.generated}</span>
                    </div>
                )}
            </div>
        )
    }

    // Video edit completed — duration + operation count + file size
    if (inner === 'video-edit:completed') {
        return (
            <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                {data.totalDurationMs != null && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">
                        ⏱ {formatDuration(data.totalDurationMs)}
                    </span>
                )}
                {data.operationCount != null && (
                    <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-100">
                        ⚙️ {data.operationCount} filter
                    </span>
                )}
                {data.fileSizeMB != null && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                        📦 {data.fileSizeMB} MB
                    </span>
                )}
            </div>
        )
    }

    // Video edit failed — show error
    if (inner === 'video-edit:failed' && data.error) {
        return (
            <p className="mt-1 text-[10px] text-red-500 bg-red-50 rounded px-2 py-1 border border-red-100">
                {data.error}
            </p>
        )
    }

    // Published — show URL + time
    if (inner === 'video:published' && data.publishedUrl) {
        return (
            <a href={data.publishedUrl} target="_blank" rel="noopener noreferrer"
                className="mt-1 text-[10px] text-blue-500 underline hover:no-underline block truncate">
                🔗 {data.publishedUrl}
            </a>
        )
    }

    // Scheduled — show time
    if (inner === 'scheduler:scheduled' && data.scheduledFor) {
        const t = new Date(data.scheduledFor)
        return (
            <span className="mt-1 text-[10px] text-indigo-500 block">
                📅 {t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} lúc {t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
        )
    }

    // Rescheduled — show new time + reason
    if (inner === 'scheduler:rescheduled' && data.newTime) {
        const t = new Date(data.newTime)
        return (
            <span className="mt-1 text-[10px] text-amber-600 block">
                🔄 Lịch mới: {t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} lúc {t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                {data.reason === 'missed' && ' (bị lỡ)'}
            </span>
        )
    }

    // Duplicate detected
    if (inner === 'video:duplicate-detected' && data.reason) {
        return (
            <p className="mt-1 text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-100">
                {data.reason}
            </p>
        )
    }

    // Violation
    if (inner === 'violation:detected' && data.error) {
        return (
            <p className="mt-1 text-[10px] text-red-500 bg-red-50 rounded px-2 py-1 border border-red-100">
                {typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}
            </p>
        )
    }

    // Generic fallback — show status/error/url/operations
    let extra: string | null = null
    if (data.url) extra = data.url
    else if (data.publishedUrl) extra = data.publishedUrl
    else if (data.error) extra = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
    else if (data.operations) extra = `${data.operations.length} thao tác chỉnh sửa`
    else if (data.status) extra = `Trạng thái: ${data.status}`
    else if (data.path) extra = `📂 ${data.path.replace(/\\/g, '/').split('/').pop()}`

    if (!extra) return null
    const isError = event.includes('failed') || event.includes('violation') || event.includes('error')
    return (
        <p className={`text-[10px] mt-0.5 truncate ${isError ? 'text-red-500' : 'text-blue-500'}`}>
            {extra.startsWith('http') ? (
                <a href={extra} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                    🔗 {extra}
                </a>
            ) : extra}
        </p>
    )
}

export function VideoHistory({ campaignId, videoId, isExpanded }: VideoHistoryProps) {
    const [events, setEvents] = useState<VideoEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [retryingNode, setRetryingNode] = useState<string | null>(null)

    const api = (window as any).api

    // Lazy-load events on first expand
    useEffect(() => {
        if (!isExpanded || loaded) return

        setLoading(true)
        const load = async () => {
            try {
                const result = await api?.invoke?.('campaign:get-video-events', {
                    campaignId,
                    videoId,
                    limit: 100,
                })
                setEvents(result || [])
            } catch (e) {
                console.error('[VideoHistory] Failed to load events:', e)
            } finally {
                setLoading(false)
                setLoaded(true)
            }
        }
        load()
    }, [isExpanded, campaignId, videoId, loaded])

    // Area E: Realtime refresh — listen to execution:log IPC events
    useEffect(() => {
        if (!isExpanded || !loaded) return
        const unsub = api?.on?.('execution:log', (payload: any) => {
            if (payload?.campaign_id !== campaignId) return
            // Check if this event is relevant to our video
            const dataStr = payload.data_json || (payload.data ? JSON.stringify(payload.data) : '')
            if (!dataStr.includes(videoId) && !(payload.message || '').includes(videoId)) return
            setEvents(prev => [...prev, {
                event: payload.event,
                message: payload.message || '',
                data: payload.data_json || (payload.data ? JSON.stringify(payload.data) : null),
                created_at: payload.created_at || new Date().toISOString(),
                node_id: payload.node_id,
                instance_id: payload.instance_id,
            }])
        })
        return () => { if (typeof unsub === 'function') unsub() }
    }, [isExpanded, loaded, campaignId, videoId])

    // Area F: Inline retry handler — includes videoId for proper scope
    const handleRetry = useCallback(async (instanceId: string, retryVideoId?: string) => {
        if (!instanceId) return
        setRetryingNode(instanceId)
        try {
            await api?.invoke?.('pipeline:retry-node', { campaignId, instanceId, videoId: retryVideoId || videoId })
        } catch (err: any) {
            console.error('[VideoHistory] Retry failed:', err)
        } finally {
            setRetryingNode(null)
        }
    }, [campaignId, videoId])

    // Group consecutive node:progress events
    const groupedEvents = useMemo(() => {
        const result: VideoEvent[] = []
        let lastProgress: VideoEvent | null = null

        for (const ev of events) {
            const inner = ev.event.startsWith('node:event:') ? ev.event.slice('node:event:'.length) : ev.event
            if (inner === 'node:progress') {
                lastProgress = ev
            } else {
                if (lastProgress) {
                    result.push(lastProgress)
                    lastProgress = null
                }
                result.push(ev)
            }
        }
        if (lastProgress) result.push(lastProgress)
        return result
    }, [events])

    if (!isExpanded) return null

    if (loading) {
        return (
            <div className="px-4 py-3 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                    <span>⏳</span> Đang tải lịch sử...
                </div>
            </div>
        )
    }

    if (groupedEvents.length === 0) {
        return (
            <div className="px-4 py-3 border-t border-slate-200">
                <div className="text-xs text-slate-400 text-center">Chưa có sự kiện nào</div>
            </div>
        )
    }

    return (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-200" />

                {groupedEvents.map((ev, i) => {
                    const config = resolveEventConfig(ev.event)
                    const { time: timeStr, date: dateStr } = formatTime(ev.created_at)
                    const nodeLabel = ev.node_id ? NODE_LABELS[ev.node_id] : null

                    // Parse data
                    let parsedData: any = null
                    try {
                        parsedData = ev.data ? JSON.parse(ev.data) : null
                    } catch { }

                    const isError = ev.event.includes('failed') || ev.event.includes('violation')
                        || ev.event.includes('error') || ev.event.includes('expired')
                    const showRetry = isError && ev.instance_id

                    return (
                        <div key={i} className="flex items-start gap-3 mb-3 last:mb-0 relative">
                            {/* Dot */}
                            <div
                                className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] shrink-0 absolute -left-[9px] bg-white border-2"
                                style={{ borderColor: config.color }}
                            >
                                {config.icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 ml-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`text-xs font-medium ${isError ? 'text-red-600' : 'text-slate-700'}`}>
                                            {config.label}
                                        </span>
                                        {nodeLabel && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                                                {nodeLabel.icon} {nodeLabel.label}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                        {dateStr} {timeStr}
                                    </span>
                                </div>

                                {/* Message (only if meaningful) */}
                                {ev.message && ev.message !== config.label && !ev.message.startsWith('{') && ev.message.length < 200 && (
                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{ev.message}</p>
                                )}

                                {/* Rich data rendering */}
                                <RichEventData event={ev.event} data={parsedData} />

                                {/* Area F: Inline retry button */}
                                {showRetry && (
                                    <button
                                        onClick={() => handleRetry(ev.instance_id!, parsedData?.videoId)}
                                        disabled={retryingNode === ev.instance_id}
                                        className="mt-1.5 text-[10px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition cursor-pointer font-medium disabled:opacity-50"
                                    >
                                        {retryingNode === ev.instance_id ? '⏳ Đang thử lại...' : '🔄 Thử lại'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

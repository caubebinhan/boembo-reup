/**
 * VideoHistory — Modern per-video event timeline
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
    'core.media_downloader': { icon: '⬇️', label: 'Tải video' },
    'core.publish_scheduler': { icon: '📅', label: 'Lên lịch' },
    'core.video_edit': { icon: '🎬', label: 'Chỉnh sửa' },
    'core.caption_gen': { icon: '✍️', label: 'Caption' },
    'tiktok.publisher': { icon: '📤', label: 'Đăng TikTok' },
    'tiktok.account_dedup': { icon: '🔍', label: 'Kiểm tra trùng' },
    'core.skip_processed': { icon: '🔍', label: 'Kiểm tra trùng' },
    'core.time_gate': { icon: '⏰', label: 'Chờ lịch' },
    'tiktok.scanner': { icon: '🔎', label: 'Quét video' },
    'core.source_watcher': { icon: '👁', label: 'Theo dõi' },
    'core.condition': { icon: '🔀', label: 'Điều kiện' },
}

// ── Event type → display config ──
type EventCategory = 'success' | 'error' | 'warning' | 'info' | 'progress' | 'system'
interface EventDisplay { label: string; category: EventCategory; dotColor: string }

const EVENT_CONFIG: Record<string, EventDisplay> = {
    // Download
    'video:queued': { label: 'Đã xếp hàng', category: 'info', dotColor: '#94a3b8' },
    'video:downloading': { label: 'Đang tải video', category: 'progress', dotColor: '#3b82f6' },
    'video:downloaded': { label: 'Tải xong', category: 'success', dotColor: '#10b981' },
    // Edit
    'video:editing': { label: 'Đang chỉnh sửa', category: 'progress', dotColor: '#8b5cf6' },
    'video:edited': { label: 'Chỉnh sửa xong', category: 'success', dotColor: '#10b981' },
    'video-edit:started': { label: 'Bắt đầu chỉnh sửa', category: 'progress', dotColor: '#8b5cf6' },
    'video-edit:completed': { label: 'Chỉnh sửa xong', category: 'success', dotColor: '#10b981' },
    'video-edit:failed': { label: 'Lỗi chỉnh sửa', category: 'error', dotColor: '#ef4444' },
    'video-edit:operation-applied': { label: 'Áp dụng filter', category: 'info', dotColor: '#7c3aed' },
    // Caption
    'caption:transformed': { label: 'Đã tạo caption', category: 'success', dotColor: '#06b6d4' },
    // Scheduler
    'scheduler:scheduled': { label: 'Đã lên lịch', category: 'info', dotColor: '#6366f1' },
    'scheduler:rescheduled': { label: 'Đã đổi lịch', category: 'warning', dotColor: '#f59e0b' },
    // Publish
    'video:active': { label: 'Đang đăng', category: 'progress', dotColor: '#f59e0b' },
    'video:published': { label: 'Đã đăng thành công', category: 'success', dotColor: '#10b981' },
    'video:submitted': { label: 'Đã gửi, chờ duyệt', category: 'warning', dotColor: '#f59e0b' },
    'video:publish-status': { label: 'Cập nhật trạng thái', category: 'info', dotColor: '#6366f1' },
    'publish:debug': { label: 'Debug upload', category: 'system', dotColor: '#94a3b8' },
    // Errors
    'violation:detected': { label: 'Đăng thất bại', category: 'error', dotColor: '#ef4444' },
    'captcha:detected': { label: 'CAPTCHA', category: 'error', dotColor: '#f97316' },
    'session:expired': { label: 'Phiên hết hạn', category: 'error', dotColor: '#ef4444' },
    'video:duplicate-detected': { label: 'Video trùng', category: 'warning', dotColor: '#f59e0b' },
    'video:failed': { label: 'Thất bại', category: 'error', dotColor: '#ef4444' },
    'video:skipped': { label: 'Đã bỏ qua', category: 'info', dotColor: '#94a3b8' },
    // Node lifecycle
    'node:start': { label: 'Bắt đầu xử lý', category: 'info', dotColor: '#3b82f6' },
    'node:end': { label: 'Hoàn tất', category: 'success', dotColor: '#10b981' },
    'node:error': { label: 'Lỗi node', category: 'error', dotColor: '#ef4444' },
    'node:failed': { label: 'Lỗi node', category: 'error', dotColor: '#ef4444' },
    'node:progress': { label: 'Đang xử lý', category: 'progress', dotColor: '#94a3b8' },
    // System
    'pipeline:info': { label: 'Hệ thống', category: 'system', dotColor: '#94a3b8' },
    'pipeline:manual-retry': { label: 'Thử lại (thủ công)', category: 'info', dotColor: '#3b82f6' },
    'publish:failed': { label: 'Đăng thất bại', category: 'error', dotColor: '#ef4444' },
    'download:failed': { label: 'Tải thất bại', category: 'error', dotColor: '#ef4444' },
    'scan:failed': { label: 'Quét thất bại', category: 'error', dotColor: '#ef4444' },
    // Retry
    'node:retry-scheduled': { label: 'Đang thử lại', category: 'warning', dotColor: '#f59e0b' },
    'retry:queued': { label: 'Đang thử lại', category: 'progress', dotColor: '#3b82f6' },
}
const DEFAULT_EVENT: EventDisplay = { label: 'Sự kiện', category: 'info', dotColor: '#94a3b8' }

function resolveEventConfig(event: string): EventDisplay {
    if (EVENT_CONFIG[event]) return EVENT_CONFIG[event]
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

// ── Badge component ──
function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'error' | 'warning' | 'purple' | 'blue' }) {
    const styles: Record<string, string> = {
        default: 'bg-slate-100 text-slate-600 border-slate-200',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        error: 'bg-red-50 text-red-600 border-red-200',
        warning: 'bg-amber-50 text-amber-700 border-amber-200',
        purple: 'bg-violet-50 text-violet-700 border-violet-200',
        blue: 'bg-blue-50 text-blue-600 border-blue-200',
    }
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${styles[variant]}`}>
            {children}
        </span>
    )
}

/** Render rich context for specific event types */
function RichEventData({ event, data }: { event: string; data: any }) {
    if (!data) return null
    const inner = event.startsWith('node:event:') ? event.slice('node:event:'.length) : event

    // ── Downloaded — file size + download time ──
    if (inner === 'video:downloaded') {
        return (
            <div className="mt-2 flex flex-wrap gap-1.5">
                {data.fileSizeMB != null && <Badge variant="blue">📦 {data.fileSizeMB} MB</Badge>}
                {data.downloadDurationMs != null && <Badge>⏱ {formatDuration(data.downloadDurationMs)}</Badge>}
                {data.localPath && (
                    <Badge>📂 {data.localPath.replace(/\\/g, '/').split('/').pop()}</Badge>
                )}
            </div>
        )
    }

    // ── Caption — Original vs Posted ──
    if (inner === 'caption:transformed' && (data.original || data.generated)) {
        return (
            <div className="mt-2 space-y-2">
                {data.original && (
                    <div className="rounded-lg px-3 py-2 bg-slate-50 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">📝 Caption gốc</div>
                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">{data.original}</p>
                    </div>
                )}
                {data.generated && (
                    <div className="rounded-lg px-3 py-2 bg-emerald-50/80 border border-emerald-200">
                        <div className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-1">📢 Caption đăng</div>
                        <p className="text-[11px] text-emerald-700 font-medium leading-relaxed line-clamp-2">{data.generated}</p>
                    </div>
                )}
            </div>
        )
    }

    // ── Video edit completed — duration + filters ──
    if (inner === 'video-edit:completed') {
        const ops: string[] = Array.isArray(data.operations)
            ? data.operations.map((op: any) => typeof op === 'string' ? op : op.name || op.pluginId || '?')
            : []
        return (
            <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                    {data.totalDurationMs != null && <Badge variant="purple">⏱ {formatDuration(data.totalDurationMs)}</Badge>}
                    {data.operationCount != null && <Badge variant="purple">⚙️ {data.operationCount} filter</Badge>}
                    {data.fileSizeMB != null && <Badge variant="blue">📦 {data.fileSizeMB} MB</Badge>}
                </div>
                {ops.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {ops.map((name, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium border border-violet-200">
                                {name.replace('builtin.', '')}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // ── Video edit operation applied ──
    if (inner === 'video-edit:operation-applied' && (data.pluginId || data.name)) {
        return (
            <div className="mt-1.5">
                <Badge variant="purple">
                    ⚙️ {(data.pluginId || data.name || '').replace('builtin.', '')}
                    {data.durationMs != null && ` (${formatDuration(data.durationMs)})`}
                </Badge>
            </div>
        )
    }

    // ── Video edit failed ──
    if (inner === 'video-edit:failed') {
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-red-50 border border-red-200">
                <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">❌ Lỗi chỉnh sửa video</div>
                {data.error && <p className="text-[11px] text-red-600 mt-1 break-words leading-relaxed">{data.error}</p>}
                {data.pluginId && <p className="text-[10px] text-red-400 mt-1">Plugin: {data.pluginId}</p>}
            </div>
        )
    }

    // ── Published ──
    if (inner === 'video:published' && (data.videoUrl || data.publishedUrl)) {
        const url = data.videoUrl || data.publishedUrl
        return (
            <div className="mt-2 rounded-lg px-3 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
                <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">🎉 Đã đăng thành công</div>
                <a href={url} target="_blank" rel="noopener noreferrer"
                    className="block mt-1 text-[11px] text-blue-600 underline decoration-blue-300 hover:decoration-blue-500 truncate font-medium transition-colors">
                    🔗 {url}
                </a>
                {data.reviewVerifiedAfterMs != null && (
                    <p className="text-[10px] text-emerald-500 mt-1">Xác minh sau {Math.round(data.reviewVerifiedAfterMs / 60000)} phút</p>
                )}
            </div>
        )
    }

    // ── Submitted ──
    if (inner === 'video:submitted') {
        const url = data.videoUrl || data.publishedUrl
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-amber-50/80 border border-amber-200">
                <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">📋 Đã gửi, chờ duyệt</div>
                {data.status && <p className="text-[11px] text-amber-700 mt-1">Trạng thái: {data.status}</p>}
                {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                        className="block mt-1 text-[10px] text-blue-500 underline hover:no-underline truncate">
                        🔗 {url}
                    </a>
                )}
                {data.warning && <p className="text-[10px] text-amber-500 mt-1">⚠️ {data.warning}</p>}
            </div>
        )
    }

    // ── Publish verify status ──
    if (inner === 'video:publish-status' && data.attempts != null) {
        return (
            <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="blue">🔄 Lần {data.attempts}/{data.maxRetries || '?'}</Badge>
                {data.status && <Badge>📊 {data.status}</Badge>}
                {data.nextRetryAt && (
                    <Badge variant="warning">⏰ Thử lại: {new Date(data.nextRetryAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Badge>
                )}
            </div>
        )
    }

    // ── Scheduled ──
    if (inner === 'scheduler:scheduled' && data.scheduledFor) {
        const t = new Date(data.scheduledFor)
        return (
            <div className="mt-1.5">
                <Badge variant="blue">
                    📅 {t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} lúc {t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </Badge>
            </div>
        )
    }

    // ── Rescheduled ──
    if (inner === 'scheduler:rescheduled' && data.newTime) {
        const t = new Date(data.newTime)
        return (
            <div className="mt-1.5">
                <Badge variant="warning">
                    🔄 Lịch mới: {t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} lúc {t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    {data.reason === 'missed' && ' (bị lỡ)'}
                </Badge>
            </div>
        )
    }

    // ── Duplicate detected ──
    if (inner === 'video:duplicate-detected') {
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-amber-50/80 border border-amber-200">
                <div className="text-[10px] font-semibold text-amber-600">♻️ Video trùng</div>
                {data.reason && <p className="text-[11px] text-amber-700 mt-1">{data.reason}</p>}
                {data.matchedBy && <p className="text-[10px] text-amber-500 mt-1">Phát hiện bằng: {data.matchedBy}</p>}
            </div>
        )
    }

    // ── Violation ──
    if (inner === 'violation:detected') {
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-red-50 border border-red-200">
                <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">🚫 Vi phạm chính sách</div>
                {data.error && <p className="text-[11px] text-red-600 mt-1 break-words leading-relaxed">{typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}</p>}
            </div>
        )
    }

    // ── Captcha ──
    if (inner === 'captcha:detected') {
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-orange-50 border border-orange-200">
                <div className="text-[10px] font-semibold text-orange-600">⚠️ CAPTCHA yêu cầu xác minh</div>
                {data.message && <p className="text-[11px] text-orange-700 mt-1">{data.message}</p>}
            </div>
        )
    }

    // ── Session expired ──
    if (inner === 'session:expired') {
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-red-50 border border-red-200">
                <div className="text-[10px] font-semibold text-red-500">🔑 Phiên đăng nhập hết hạn</div>
                {data.message && <p className="text-[11px] text-red-600 mt-1">{data.message}</p>}
            </div>
        )
    }

    // ── Publish failed — show error detail ──
    if (inner === 'publish:failed') {
        return (
            <div className="mt-2 rounded-lg px-3 py-2 bg-red-50 border border-red-200">
                <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">❌ Đăng thất bại</div>
                {data.errorType && <Badge variant="error">🏷 {data.errorType}</Badge>}
                {data.error && <p className="text-[11px] text-red-600 mt-1 break-words leading-relaxed">{typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}</p>}
                {data.description && <p className="text-[10px] text-slate-400 mt-1 truncate">📝 {data.description.substring(0, 60)}...</p>}
            </div>
        )
    }

    // ── Retry scheduled — show attempt + delay ──
    if (inner === 'node:retry-scheduled') {
        return (
            <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="warning">🔄 Lần {data.attempt}/{data.maxRetries}</Badge>
                {data.delayMs && <Badge>⏰ Chờ {Math.round(data.delayMs / 1000)}s</Badge>}
                {data.error && <p className="text-[11px] text-amber-600 mt-1 truncate">{data.error}</p>}
            </div>
        )
    }

    // ── Generic fallback ──
    let extra: string | null = null
    if (data.publishedUrl || data.videoUrl) extra = data.publishedUrl || data.videoUrl
    else if (data.url) extra = data.url
    else if (data.error) extra = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
    else if (data.operations) extra = `${data.operations.length} thao tác chỉnh sửa`
    else if (data.status) extra = `Trạng thái: ${data.status}`
    else if (data.path) extra = `📂 ${data.path.replace(/\\/g, '/').split('/').pop()}`

    if (!extra) return null
    const isError = event.includes('failed') || event.includes('violation') || event.includes('error')
    return (
        <p className={`text-[11px] mt-1 truncate leading-relaxed ${isError ? 'text-red-500' : 'text-slate-500'}`}>
            {extra.startsWith('http') ? (
                <a href={extra} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline decoration-blue-300 hover:decoration-blue-500 transition-colors">
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
    const [retrying, setRetrying] = useState<Set<string>>(new Set())
    const [retried, setRetried] = useState<Set<string>>(new Set())

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

    // Realtime refresh — listen to execution:log IPC events
    useEffect(() => {
        if (!isExpanded || !loaded) return
        const unsub = api?.on?.('execution:log', (payload: any) => {
            if (payload?.campaign_id !== campaignId) return
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

    // Inline retry handler
    const handleRetry = useCallback(async (instanceId: string, retryVideoId?: string) => {
        if (!instanceId) return
        const key = `${instanceId}::${retryVideoId || videoId}`
        if (retrying.has(key) || retried.has(key)) return
        setRetrying(prev => new Set([...prev, key]))
        try {
            const result = await api?.invoke?.('pipeline:retry-node', { campaignId, instanceId, videoId: retryVideoId || videoId })
            if (result?.success || result?.alreadyPending) {
                setRetried(prev => new Set([...prev, key]))
            }
        } catch (err: any) {
            console.error('[VideoHistory] Retry failed:', err)
        } finally {
            setRetrying(prev => { const s = new Set(prev); s.delete(key); return s })
        }
    }, [campaignId, videoId, retrying, retried])

    // Group consecutive node:progress events
    const groupedEvents = useMemo(() => {
        const result: VideoEvent[] = []
        let lastProgress: VideoEvent | null = null

        for (const ev of events) {
            const inner = ev.event.startsWith('node:event:') ? ev.event.slice('node:event:'.length) : ev.event
            if (inner === 'node:data' || ev.event === 'node:data') continue
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
            <div className="px-4 py-4 border-t border-slate-200/60">
                <div className="flex items-center gap-2.5 text-xs text-slate-400">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    Đang tải lịch sử...
                </div>
            </div>
        )
    }

    if (groupedEvents.length === 0) {
        return (
            <div className="px-4 py-4 border-t border-slate-200/60">
                <div className="text-xs text-slate-400 text-center py-2">Chưa có sự kiện nào</div>
            </div>
        )
    }

    return (
        <div className="border-t border-slate-200/60 bg-gradient-to-b from-slate-50/80 to-white">
            {/* Header */}
            <div className="px-4 pt-3 pb-1.5">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-500 to-blue-500" />
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Timeline · {groupedEvents.length} sự kiện
                    </span>
                </div>
            </div>

            {/* Timeline */}
            <div className="px-4 pb-3">
                <div className="relative ml-3">
                    {/* Vertical line */}
                    <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />

                    {groupedEvents.map((ev, i) => {
                        const config = resolveEventConfig(ev.event)
                        const { time: timeStr, date: dateStr } = formatTime(ev.created_at)
                        const nodeLabel = ev.node_id ? NODE_LABELS[ev.node_id] : null

                        let parsedData: any = null
                        try { parsedData = ev.data ? JSON.parse(ev.data) : null } catch { }

                        const isError = config.category === 'error'
                        const isSuccess = config.category === 'success'
                        const showRetry = isError && ev.instance_id

                        // Card background based on category
                        const cardBg = isError
                            ? 'bg-red-50/50 border-red-100 hover:bg-red-50/80'
                            : isSuccess
                                ? 'bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50'
                                : 'bg-white border-slate-100 hover:bg-slate-50/50'

                        return (
                            <div key={i} className="relative pl-6 pb-3 last:pb-0 group">
                                {/* Timeline dot */}
                                <div
                                    className="absolute left-0 top-2.5 w-[10px] h-[10px] rounded-full border-2 border-white shadow-sm -translate-x-[4px] z-10 transition-transform group-hover:scale-125"
                                    style={{ backgroundColor: config.dotColor }}
                                />

                                {/* Event card */}
                                <div className={`rounded-lg border px-3 py-2 transition-colors ${cardBg}`}>
                                    {/* Header row */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className={`text-[12px] font-semibold leading-tight ${isError ? 'text-red-600' : isSuccess ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                {config.label}
                                            </span>
                                            {nodeLabel && (
                                                <span className="text-[10px] px-1.5 py-px rounded-md bg-slate-100 text-slate-500 border border-slate-200 shrink-0 font-medium">
                                                    {nodeLabel.icon} {nodeLabel.label}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 shrink-0 font-mono tabular-nums">
                                            {dateStr} {timeStr}
                                        </span>
                                    </div>

                                    {/* Message */}
                                    {ev.message && ev.message !== config.label && !ev.message.startsWith('{') && ev.message.length < 200 && (
                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{ev.message}</p>
                                    )}

                                    {/* Rich data */}
                                    <RichEventData event={ev.event} data={parsedData} />

                                    {/* Inline retry button */}
                                    {showRetry && (() => {
                                        const key = `${ev.instance_id}::${parsedData?.videoId || videoId}`
                                        const isInFlight = retrying.has(key)
                                        const isDone = retried.has(key)
                                        if (isDone) return null
                                        return (
                                            <button
                                                onClick={() => handleRetry(ev.instance_id!, parsedData?.videoId)}
                                                disabled={isInFlight}
                                                className="mt-2 text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer
                                                    bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200
                                                    disabled:opacity-50 disabled:cursor-not-allowed
                                                    active:scale-95"
                                            >
                                                {isInFlight ? '⏳ Đang thử lại...' : '🔄 Thử lại'}
                                            </button>
                                        )
                                    })()}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

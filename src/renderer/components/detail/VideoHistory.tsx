/**
 * VideoHistory — Per-video event timeline
 * ────────────────────────────────────────
 * Shows a vertical timeline of all events for a specific video:
 * download, edit, publish, errors, status changes.
 * Expandable — lazy-loads events on first expand.
 */
import { useState, useEffect, useMemo } from 'react'

interface VideoEvent {
    event: string
    message: string
    data: string | null
    created_at: string
}

interface VideoHistoryProps {
    campaignId: string
    videoId: string        // platform_id
    isExpanded: boolean
}

// Event type → display config
const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    'video:queued': { icon: '📋', label: 'Queued', color: '#64748b' },
    'video:downloading': { icon: '⬇️', label: 'Downloading', color: '#3b82f6' },
    'video:downloaded': { icon: '✅', label: 'Downloaded', color: '#059669' },
    'video:editing': { icon: '🎬', label: 'Editing', color: '#8b5cf6' },
    'video:edited': { icon: '✅', label: 'Edit complete', color: '#059669' },
    'video:active': { icon: '📤', label: 'Publishing', color: '#f59e0b' },
    'video:published': { icon: '🎉', label: 'Published', color: '#059669' },
    'video:publish-status': { icon: '🔄', label: 'Status update', color: '#6366f1' },
    'violation:detected': { icon: '🚫', label: 'Publish failed', color: '#dc2626' },
    'captcha:detected': { icon: '⚠️', label: 'CAPTCHA', color: '#ea580c' },
    'video:duplicate-detected': { icon: '♻️', label: 'Duplicate', color: '#d97706' },
    'video:failed': { icon: '❌', label: 'Failed', color: '#dc2626' },
    'video:skipped': { icon: '⏭️', label: 'Skipped', color: '#64748b' },
    'node:progress': { icon: '⏳', label: 'Processing', color: '#6b7280' },
}
const DEFAULT_EVENT = { icon: '📝', label: 'Event', color: '#6b7280' }

export function VideoHistory({ campaignId, videoId, isExpanded }: VideoHistoryProps) {
    const [events, setEvents] = useState<VideoEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Lazy-load events on first expand
    useEffect(() => {
        if (!isExpanded || loaded) return

        setLoading(true)
        const load = async () => {
            try {
                // @ts-ignore
                const result = await window.api?.invoke?.('campaign:get-video-events', {
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

    // Group consecutive node:progress events
    const groupedEvents = useMemo(() => {
        const result: VideoEvent[] = []
        let lastProgress: VideoEvent | null = null

        for (const ev of events) {
            if (ev.event === 'node:progress') {
                lastProgress = ev // keep only last progress event
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
                    <span>⏳</span> Loading history...
                </div>
            </div>
        )
    }

    if (groupedEvents.length === 0) {
        return (
            <div className="px-4 py-3 border-t border-slate-200">
                <div className="text-xs text-slate-400 text-center">No events yet</div>
            </div>
        )
    }

    return (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-200" />

                {groupedEvents.map((ev, i) => {
                    const config = EVENT_CONFIG[ev.event] || DEFAULT_EVENT
                    const time = new Date(ev.created_at)
                    const timeStr = time.toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                    })
                    const dateStr = time.toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                    })

                    // Parse data for extra info
                    let extra: string | null = null
                    try {
                        const data = ev.data ? JSON.parse(ev.data) : null
                        if (data?.url) extra = data.url
                        else if (data?.publishedUrl) extra = data.publishedUrl
                        else if (data?.error) extra = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
                        else if (data?.operations) extra = `${data.operations.length} thao tác chỉnh sửa`
                        else if (data?.status) extra = `Trạng thái: ${data.status}`
                        else if (data?.path) extra = `📂 ${data.path.replace(/\\/g, '/').split('/').pop()}`
                    } catch { }

                    const isError = ev.event.includes('failed') || ev.event.includes('violation') || ev.event.includes('error')

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
                                    <span className={`text-xs font-medium ${isError ? 'text-red-600' : 'text-slate-700'}`}>
                                        {config.label}
                                    </span>
                                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                        {dateStr} {timeStr}
                                    </span>
                                </div>

                                {ev.message && ev.message !== config.label && !ev.message.startsWith('{') && ev.message.length < 200 && (
                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{ev.message}</p>
                                )}

                                {extra && (
                                    <p className={`text-[10px] mt-0.5 truncate ${isError ? 'text-red-500' : 'text-blue-500'
                                        }`}>
                                        {extra.startsWith('http') ? (
                                            <a href={extra} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                                                🔗 {extra}
                                            </a>
                                        ) : extra}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

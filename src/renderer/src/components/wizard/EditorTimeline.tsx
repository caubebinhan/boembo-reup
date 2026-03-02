/**
 * EditorTimeline — Multi-track timeline (CapCut-style)
 * ────────────────────────────────────────────────────
 * Shows time ruler + one track per operation.
 * Draggable playhead, zoomable, click-to-seek.
 */
import { useRef, useCallback, useState, useMemo } from 'react'

interface PluginMeta {
    id: string
    name: string
    group: string
    icon: string
    previewHint: string
}

interface VideoEditOperation {
    id: string
    pluginId: string
    enabled: boolean
    params: Record<string, any>
    order: number
}

interface EditorTimelineProps {
    operations: VideoEditOperation[]
    plugins: PluginMeta[]
    duration: number               // video duration in seconds
    currentTime: number            // current playhead position
    selectedOpId: string | null
    onSeek: (time: number) => void
    onSelectOperation: (opId: string) => void
    onTimeRangeChange?: (opId: string, start: number, end: number) => void
}

// Track colors by plugin group
const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'transform': { bg: '#3b82f6', border: '#2563eb', text: '#dbeafe' },
    'overlay': { bg: '#8b5cf6', border: '#7c3aed', text: '#ede9fe' },
    'filter': { bg: '#ec4899', border: '#db2777', text: '#fce7f3' },
    'audio': { bg: '#06b6d4', border: '#0891b2', text: '#cffafe' },
    'anti-detect': { bg: '#f59e0b', border: '#d97706', text: '#fef3c7' },
}
const DEFAULT_COLOR = { bg: '#6b7280', border: '#4b5563', text: '#f3f4f6' }

export function EditorTimeline({
    operations,
    plugins,
    duration,
    currentTime,
    selectedOpId,
    onSeek,
    onSelectOperation,
}: EditorTimelineProps) {
    const rulerRef = useRef<HTMLDivElement>(null)
    const [zoom, setZoom] = useState(1) // pixels per second

    const effectiveDuration = Math.max(duration, 10)
    const pxPerSecond = useMemo(() => Math.max(30, 60 * zoom), [zoom])
    const totalWidth = effectiveDuration * pxPerSecond

    // Time markers
    const markers = useMemo(() => {
        const interval = zoom > 1.5 ? 1 : zoom > 0.5 ? 5 : 10
        const result: number[] = []
        for (let t = 0; t <= effectiveDuration; t += interval) result.push(t)
        return result
    }, [effectiveDuration, zoom])

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = Math.floor(sec % 60)
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    // Click-to-seek on ruler
    const handleRulerClick = useCallback((e: React.MouseEvent) => {
        const rect = rulerRef.current?.getBoundingClientRect()
        if (!rect) return
        const scrollLeft = rulerRef.current?.parentElement?.scrollLeft || 0
        const x = e.clientX - rect.left + scrollLeft
        const time = Math.max(0, Math.min(effectiveDuration, x / pxPerSecond))
        onSeek(time)
    }, [effectiveDuration, pxPerSecond, onSeek])

    // Playhead position
    const playheadX = currentTime * pxPerSecond

    // Sort operations by order
    const sortedOps = useMemo(
        () => [...operations].sort((a, b) => a.order - b.order),
        [operations]
    )

    return (
        <div className="flex flex-col bg-slate-900 border-t border-slate-700 select-none" style={{ minHeight: 180 }}>
            {/* Toolbar row */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/50 bg-slate-800/50">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="font-medium text-slate-300">Timeline</span>
                    <span>·</span>
                    <span>{sortedOps.length} track{sortedOps.length !== 1 ? 's' : ''}</span>
                </div>
                {/* Zoom control */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">🔍</span>
                    <input
                        type="range"
                        min={0.2}
                        max={3}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-20 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-purple-500"
                    />
                </div>
            </div>

            {/* Scrollable timeline */}
            <div className="flex-1 overflow-x-auto overflow-y-auto relative" style={{ maxHeight: 300 }}>
                <div style={{ width: totalWidth + 60, minHeight: '100%' }} className="relative">
                    {/* Time ruler */}
                    <div
                        ref={rulerRef}
                        className="sticky top-0 z-10 h-6 bg-slate-800 border-b border-slate-700 cursor-pointer"
                        onClick={handleRulerClick}
                    >
                        {markers.map(t => (
                            <div
                                key={t}
                                className="absolute top-0 h-full flex flex-col items-center"
                                style={{ left: t * pxPerSecond + 40 }}
                            >
                                <span className="text-[9px] text-slate-500 mt-0.5">{formatTime(t)}</span>
                                <div className="w-px h-2 bg-slate-600 mt-auto" />
                            </div>
                        ))}
                    </div>

                    {/* Track labels + bars */}
                    <div className="flex" style={{ marginTop: 0 }}>
                        {/* Labels column */}
                        <div className="w-[40px] shrink-0 sticky left-0 z-20 bg-slate-900 border-r border-slate-700/50">
                            {sortedOps.map(op => {
                                const plugin = plugins.find(p => p.id === op.pluginId)
                                const isSelected = op.id === selectedOpId
                                return (
                                    <div
                                        key={op.id}
                                        className={`h-8 flex items-center px-1.5 cursor-pointer border-b border-slate-800 transition ${isSelected ? 'bg-purple-900/30' : 'hover:bg-slate-800'
                                            }`}
                                        onClick={() => onSelectOperation(op.id)}
                                        title={plugin?.name || op.pluginId}
                                    >
                                        <span className="text-xs truncate">{plugin?.icon || '⚡'}</span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Bars column */}
                        <div className="flex-1 relative">
                            {sortedOps.map((op, i) => {
                                const plugin = plugins.find(p => p.id === op.pluginId)
                                const color = GROUP_COLORS[plugin?.group || ''] || DEFAULT_COLOR
                                const isSelected = op.id === selectedOpId

                                // Time range from params, or full duration
                                const start = op.params.timeRange?.start ?? 0
                                const end = op.params.timeRange?.end ?? effectiveDuration
                                const barLeft = start * pxPerSecond
                                const barWidth = Math.max(20, (end - start) * pxPerSecond)

                                return (
                                    <div key={op.id} className="h-8 relative border-b border-slate-800/30">
                                        <div
                                            className={`absolute top-1 h-6 rounded-md cursor-pointer transition-all flex items-center px-2 gap-1 ${isSelected ? 'ring-2 ring-white/50' : ''
                                                } ${!op.enabled ? 'opacity-30' : ''}`}
                                            style={{
                                                left: barLeft + 40,
                                                width: barWidth,
                                                backgroundColor: color.bg,
                                                borderLeft: `3px solid ${color.border}`,
                                            }}
                                            onClick={() => onSelectOperation(op.id)}
                                            title={`${plugin?.name || op.pluginId} (${formatTime(start)} → ${formatTime(end)})`}
                                        >
                                            <span className="text-[10px] font-medium truncate" style={{ color: color.text }}>
                                                {plugin?.name || op.pluginId}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Playhead */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                                style={{ left: playheadX + 40 }}
                            >
                                <div className="w-3 h-3 bg-red-500 rounded-full -ml-[5px] -mt-1 border-2 border-white shadow" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

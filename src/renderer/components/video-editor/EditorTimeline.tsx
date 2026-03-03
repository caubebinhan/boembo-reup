/**
 * EditorTimeline — Multi-track NLE timeline (Vintage Pastel Light Theme)
 * Uses shared types from ./types
 */
import { useRef, useCallback, useState, useMemo } from 'react'
import type { PluginMeta, VideoEditOperation } from './types'
import { GROUP_COLORS, V } from './types'

interface EditorTimelineProps {
    operations: VideoEditOperation[]
    plugins: PluginMeta[]
    duration: number
    currentTime: number
    selectedOpId: string | null
    onSeek: (time: number) => void
    onSelectOperation: (opId: string) => void
}

const DEFAULT_COLOR = { bg: V.cream, border: V.beige, text: V.charcoal }
const GROUP_EMOJI: Record<string, string> = {
    overlay: '🖼️', transform: '📐', filter: '✨', audio: '🔊', 'anti-detect': '🛡️',
}

export function EditorTimeline({ operations, plugins, duration, currentTime, selectedOpId, onSeek, onSelectOperation }: EditorTimelineProps) {
    const rulerRef = useRef<HTMLDivElement>(null)
    const [zoom, setZoom] = useState(1)

    const effectiveDuration = Math.max(duration, 10)
    const pxPerSecond = useMemo(() => Math.max(30, 60 * zoom), [zoom])
    const totalWidth = effectiveDuration * pxPerSecond
    const markers = useMemo(() => {
        const interval = zoom > 1.5 ? 1 : zoom > 0.5 ? 5 : 10
        const r: number[] = []; for (let t = 0; t <= effectiveDuration; t += interval) r.push(t)
        return r
    }, [effectiveDuration, zoom])

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

    const handleRulerClick = useCallback((e: React.MouseEvent) => {
        const rect = rulerRef.current?.getBoundingClientRect(); if (!rect) return
        const scrollLeft = rulerRef.current?.parentElement?.scrollLeft || 0
        onSeek(Math.max(0, Math.min(effectiveDuration, (e.clientX - rect.left + scrollLeft) / pxPerSecond)))
    }, [effectiveDuration, pxPerSecond, onSeek])

    const handleRulerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const step = e.shiftKey ? 5 : 1
        const nextTime = currentTime + (e.key === 'ArrowRight' ? step : -step)
        onSeek(Math.max(0, Math.min(effectiveDuration, nextTime)))
    }, [currentTime, effectiveDuration, onSeek])

    const handleOperationKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, opId: string) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onSelectOperation(opId)
    }, [onSelectOperation])

    const playheadX = currentTime * pxPerSecond
    const sortedOps = useMemo(() => [...operations].filter(o => o.enabled).sort((a, b) => a.order - b.order), [operations])
    const LABEL_W = 96, TRACK_H = 44

    return (
        <div className="flex flex-col select-none shrink-0"
            style={{ height: 210, background: V.card, borderTop: `1px solid ${V.beige}` }}>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 shrink-0"
                style={{ height: 34, borderBottom: `1px solid ${V.beige}`, background: V.cream }}>
                <div className="flex items-center gap-2">
                    <span className="text-sm">✂️</span>
                    <span className="text-[10px] font-medium" style={{ color: V.textDim }}>
                        {sortedOps.length} track{sortedOps.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: V.textDim }}>➖</span>
                    <div className="relative h-4 flex items-center" style={{ width: 70 }}>
                        <div className="absolute h-1 rounded-full w-full" style={{ background: V.beige }} />
                        <div className="absolute h-1 rounded-full" style={{ width: `${((zoom - 0.2) / 2.8) * 100}%`, background: V.accent }} />
                        <input type="range" min={0.2} max={3} step={0.1} value={zoom}
                            aria-label="Timeline zoom"
                            onChange={e => setZoom(Number(e.target.value))}
                            className="absolute w-full opacity-0 cursor-pointer h-full" />
                    </div>
                    <span className="text-xs" style={{ color: V.textDim }}>➕</span>
                    <span className="text-[10px] font-mono w-8 text-right" style={{ color: V.accent }}>{Math.round(zoom * 100)}%</span>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto relative">
                <div style={{ width: totalWidth + LABEL_W + 20, minHeight: '100%' }} className="relative">
                    {/* Ruler */}
                    <div ref={rulerRef} className="sticky top-0 z-10 cursor-pointer"
                        role="slider"
                        tabIndex={0}
                        aria-label="Timeline playhead position"
                        aria-valuemin={0}
                        aria-valuemax={Math.round(effectiveDuration)}
                        aria-valuenow={Math.round(currentTime)}
                        style={{ height: 24, background: V.cream, borderBottom: `1px solid ${V.beige}` }}
                        onClick={handleRulerClick}
                        onKeyDown={handleRulerKeyDown}>
                        {markers.map(t => (
                            <div key={t} className="absolute top-0 h-full flex flex-col items-start" style={{ left: t * pxPerSecond + LABEL_W }}>
                                <span className="text-[10px] font-mono mt-1 ml-1" style={{ color: V.textDim }}>{fmt(t)}</span>
                                <div className="w-px mt-auto" style={{ height: 5, background: V.beige }} />
                            </div>
                        ))}
                    </div>

                    <div className="flex">
                        {/* Labels */}
                        <div className="shrink-0 sticky left-0 z-20" style={{ width: LABEL_W, background: V.card, borderRight: `1px solid ${V.beige}` }}>
                            {sortedOps.map(op => {
                                const plugin = plugins.find(p => p.id === op.pluginId)
                                const isSelected = op.id === selectedOpId
                                return (
                                    <div key={op.id} className="flex items-center gap-1.5 px-2.5 cursor-pointer transition-all"
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Select ${plugin?.name || op.pluginId} track`}
                                        style={{
                                            height: TRACK_H, borderBottom: `1px solid ${V.beige}`,
                                            background: isSelected ? V.accentSoft : 'transparent',
                                            borderLeft: `2px solid ${isSelected ? V.accent : 'transparent'}`,
                                        }}
                                        onClick={() => onSelectOperation(op.id)}
                                        onKeyDown={e => handleOperationKeyDown(e, op.id)}>
                                        <span className="text-sm shrink-0">{GROUP_EMOJI[plugin?.group || ''] || '🎬'}</span>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-semibold truncate"
                                                style={{ color: isSelected ? V.accent : V.charcoal }}>{plugin?.name || op.pluginId}</div>
                                            {!op.enabled && <div className="text-[9px]" style={{ color: V.textDim }}>off</div>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Bars */}
                        <div className="flex-1 relative">
                            {sortedOps.map(op => {
                                const plugin = plugins.find(p => p.id === op.pluginId)
                                const color = GROUP_COLORS[plugin?.group || ''] || DEFAULT_COLOR
                                const isSelected = op.id === selectedOpId
                                const start = op.params.timeRange?.start ?? 0
                                const end = op.params.timeRange?.end ?? effectiveDuration

                                return (
                                    <div key={op.id} style={{ height: TRACK_H, position: 'relative', background: V.bg, borderBottom: `1px solid ${V.beige}` }}>
                                        <div className="absolute flex items-center overflow-hidden cursor-pointer transition-all"
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Select ${plugin?.name || op.pluginId} timeline bar`}
                                            style={{
                                                left: start * pxPerSecond, width: Math.max(20, (end - start) * pxPerSecond),
                                                top: 5, bottom: 5, background: color.bg, borderRadius: 8,
                                                border: `1.5px solid ${color.border}`,
                                                opacity: op.enabled ? 1 : 0.3,
                                                boxShadow: isSelected ? `0 0 0 2px ${V.accent}, 0 2px 8px ${V.accent}22` : '0 1px 3px rgba(0,0,0,0.04)',
                                            }}
                                            onClick={() => onSelectOperation(op.id)}
                                            onKeyDown={e => handleOperationKeyDown(e, op.id)}>
                                            <span className="text-[10px] font-bold px-2.5 truncate" style={{ color: color.text }}>
                                                {plugin?.name || op.pluginId}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                            {/* Playhead */}
                            <div className="absolute top-0 bottom-0 pointer-events-none z-30"
                                style={{ left: playheadX, width: 2, background: V.accent }}>
                                <div style={{
                                    width: 0, height: 0,
                                    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                                    borderTop: `6px solid ${V.accent}`,
                                    position: 'absolute', top: -1, left: -4,
                                }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

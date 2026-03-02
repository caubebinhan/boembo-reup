/**
 * VideoCompositor — PixiJS v8 Live Video Preview
 * ───────────────────────────────────────────────
 * Renders a video with overlay layers on a WebGL canvas.
 * Supports: video playback, draggable overlays (watermark/text),
 * crop guides, blur region indicators.
 *
 * Communicates with parent via callbacks:
 *  - onPositionChange: overlay dragged → update operation params
 *  - onSelectOperation: overlay clicked → select in panel
 *  - onTimeUpdate: video time changed → sync timeline playhead
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import {
    Application,
    Sprite,
    Text,
    TextStyle,
    Graphics,
    Texture,
    Container,
    Assets,
} from 'pixi.js'

// ── Types ─────────────────────────────────────────────
interface PluginMeta {
    id: string
    name: string
    group: string
    icon: string
    previewHint: string
    configSchema: any[]
}

interface VideoEditOperation {
    id: string
    pluginId: string
    enabled: boolean
    params: Record<string, any>
    order: number
}

export interface VideoCompositorProps {
    /** file:// URL of sample video to preview, or null */
    videoSrc: string | null
    /** Current operations from wizard data */
    operations: VideoEditOperation[]
    /** Plugin metadata for resolving preview hints */
    plugins: PluginMeta[]
    /** Currently selected operation ID */
    selectedOpId: string | null
    /** Callback when user drags an overlay on canvas */
    onPositionChange?: (opId: string, position: { x: number; y: number }) => void
    /** Callback when user clicks an overlay */
    onSelectOperation?: (opId: string) => void
    /** Callback for time updates during playback */
    onTimeUpdate?: (currentTime: number, duration: number) => void
}

// ── Position resolver for 9-grid presets ──────────────
const POSITION_COORDS: Record<string, { xFrac: number; yFrac: number }> = {
    'top-left': { xFrac: 0.05, yFrac: 0.05 },
    'top-center': { xFrac: 0.5, yFrac: 0.05 },
    'top-right': { xFrac: 0.95, yFrac: 0.05 },
    'center-left': { xFrac: 0.05, yFrac: 0.5 },
    'center': { xFrac: 0.5, yFrac: 0.5 },
    'center-right': { xFrac: 0.95, yFrac: 0.5 },
    'bottom-left': { xFrac: 0.05, yFrac: 0.95 },
    'bottom-center': { xFrac: 0.5, yFrac: 0.95 },
    'bottom-right': { xFrac: 0.95, yFrac: 0.95 },
}

function resolvePosition(pos: string | { x: number; y: number }, canvasW: number, canvasH: number) {
    if (typeof pos === 'object' && pos.x != null) return { x: pos.x, y: pos.y }
    const preset = POSITION_COORDS[String(pos)] || POSITION_COORDS['center']
    return { x: preset.xFrac * canvasW, y: preset.yFrac * canvasH }
}

// ── Main Component ────────────────────────────────────
export function VideoCompositor({
    videoSrc,
    operations,
    plugins,
    selectedOpId,
    onPositionChange,
    onSelectOperation,
    onTimeUpdate,
}: VideoCompositorProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const appRef = useRef<Application | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const videoSpriteRef = useRef<Sprite | null>(null)
    const overlayContainerRef = useRef<Container | null>(null)
    const overlayMapRef = useRef<Map<string, Container>>(new Map())
    const rafRef = useRef<number>(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [initError, setInitError] = useState<string | null>(null)

    // Canvas dimensions (9:16 portrait, fitting in available space)
    const CANVAS_W = 360
    const CANVAS_H = 640

    // ── Init PixiJS Application ───────────────────────
    useEffect(() => {
        if (!containerRef.current) return

        let destroyed = false
        let initialized = false
        const app = new Application()

        const initApp = async () => {
            try {
                await app.init({
                    width: CANVAS_W,
                    height: CANVAS_H,
                    backgroundColor: 0x1a1a2e,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true,
                })
            } catch (err: any) {
                console.error('[VideoCompositor] PixiJS init failed:', err)
                setInitError(err?.message || 'Failed to initialize video preview (WebGL may be unavailable)')
                return
            }

            // If cleanup ran while we were initializing, destroy now
            if (destroyed) {
                try { app.destroy(true) } catch { /* safe */ }
                return
            }

            initialized = true

            if (!containerRef.current) return
            containerRef.current.innerHTML = ''
            containerRef.current.appendChild(app.canvas as HTMLCanvasElement)

            // Overlay container
            const overlays = new Container()
            overlays.label = 'overlays'
            app.stage.addChild(overlays)
            overlayContainerRef.current = overlays

            appRef.current = app
        }

        initApp()

        return () => {
            destroyed = true
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            // Only destroy if init completed; otherwise app.destroy throws _cancelResize
            if (initialized) {
                try { app.destroy(true) } catch (err) {
                    console.warn('[VideoCompositor] PixiJS destroy error (safe to ignore):', err)
                }
            }
            appRef.current = null
        }
    }, [])

    // ── Load Video ────────────────────────────────────
    useEffect(() => {
        const app = appRef.current
        if (!app || !videoSrc) return

        // Cleanup previous
        if (videoSpriteRef.current) {
            app.stage.removeChild(videoSpriteRef.current)
            videoSpriteRef.current.destroy()
            videoSpriteRef.current = null
        }
        if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.src = ''
            videoRef.current = null
        }

        // Create hidden <video> element
        const video = document.createElement('video')
        video.src = videoSrc
        video.crossOrigin = 'anonymous'
        video.loop = true
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'
        videoRef.current = video

        video.addEventListener('loadedmetadata', () => {
            setDuration(video.duration)

            // Create texture from video
            const texture = Texture.from(video, { autoUpdate: true } as any)
            const sprite = new Sprite(texture)

            // Scale to fit canvas preserving aspect ratio
            const videoAspect = video.videoWidth / video.videoHeight
            const canvasAspect = CANVAS_W / CANVAS_H

            if (videoAspect > canvasAspect) {
                sprite.width = CANVAS_W
                sprite.height = CANVAS_W / videoAspect
                sprite.y = (CANVAS_H - sprite.height) / 2
            } else {
                sprite.height = CANVAS_H
                sprite.width = CANVAS_H * videoAspect
                sprite.x = (CANVAS_W - sprite.width) / 2
            }

            app.stage.addChildAt(sprite, 0)
            videoSpriteRef.current = sprite

            // Bring overlays to front
            if (overlayContainerRef.current) {
                app.stage.addChild(overlayContainerRef.current)
            }
        })

        // Time update loop
        const tick = () => {
            if (video && !video.paused) {
                setCurrentTime(video.currentTime)
                onTimeUpdate?.(video.currentTime, video.duration)
            }
            rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [videoSrc, onTimeUpdate])

    // ── Sync Overlays ─────────────────────────────────
    useEffect(() => {
        const container = overlayContainerRef.current
        if (!container) return

        const currentIds = new Set(operations.filter(o => o.enabled).map(o => o.id))
        const existingIds = overlayMapRef.current

        // Remove stale overlays
        for (const [id, sprite] of existingIds) {
            if (!currentIds.has(id)) {
                container.removeChild(sprite)
                sprite.destroy()
                existingIds.delete(id)
            }
        }

        // Add/update overlays
        for (const op of operations) {
            if (!op.enabled) continue
            const plugin = plugins.find(p => p.id === op.pluginId)
            if (!plugin) continue
            const hint = plugin.previewHint || 'none'

            if (hint === 'none') continue

            let overlay = existingIds.get(op.id)

            if (hint === 'overlay-text') {
                const text = op.params.text || 'Sample Text'
                const fontSize = Math.max(10, Math.min(80, op.params.fontSize || 24))
                const fontColor = op.params.fontColor || '#ffffff'

                if (!overlay) {
                    const textObj = new Text({
                        text,
                        style: new TextStyle({
                            fontFamily: 'Arial, sans-serif',
                            fontSize,
                            fill: fontColor,
                            dropShadow: op.params.outline !== false ? {
                                color: '#000000',
                                blur: 4,
                                distance: 2,
                            } : undefined,
                        }),
                    })
                    textObj.eventMode = 'static'
                    textObj.cursor = 'grab'
                    textObj.label = op.id

                    // Drag
                    let dragging = false
                    let dragOffset = { x: 0, y: 0 }
                    textObj.on('pointerdown', (e: any) => {
                        dragging = true
                        dragOffset = { x: e.global.x - textObj.x, y: e.global.y - textObj.y }
                        onSelectOperation?.(op.id)
                    })
                    textObj.on('globalpointermove', (e: any) => {
                        if (!dragging) return
                        textObj.x = e.global.x - dragOffset.x
                        textObj.y = e.global.y - dragOffset.y
                    })
                    textObj.on('pointerup', () => {
                        if (dragging) {
                            dragging = false
                            onPositionChange?.(op.id, { x: textObj.x, y: textObj.y })
                        }
                    })
                    textObj.on('pointerupoutside', () => { dragging = false })

                    const pos = resolvePosition(op.params.position || 'bottom-center', CANVAS_W, CANVAS_H)
                    textObj.x = pos.x
                    textObj.y = pos.y
                    textObj.anchor.set(0.5)

                    container.addChild(textObj)
                    existingIds.set(op.id, textObj as any)
                } else {
                    // Update existing text
                    const textObj = overlay as unknown as Text
                    textObj.text = text
                    textObj.style.fontSize = fontSize
                    textObj.style.fill = fontColor
                }

            } else if (hint === 'overlay-image') {
                if (!overlay) {
                    // Placeholder rectangle for watermark
                    const g = new Graphics()
                    const size = Math.round(CANVAS_W * ((op.params.size || 15) / 100))
                    const opacity = op.params.opacity ?? 0.8

                    g.rect(0, 0, size, size * 0.6)
                    g.fill({ color: 0x8b5cf6, alpha: opacity })
                    g.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })
                    g.eventMode = 'static'
                    g.cursor = 'grab'
                    g.label = op.id

                    // Label
                    const label = new Text({
                        text: `🏷️ ${plugin.name}`,
                        style: new TextStyle({ fontSize: 11, fill: '#ffffff', fontFamily: 'Arial' }),
                    })
                    label.x = 4
                    label.y = 4

                    const group = new Container()
                    group.addChild(g, label)

                    // Drag
                    let dragging = false
                    let dragOffset = { x: 0, y: 0 }
                    group.eventMode = 'static'
                    group.cursor = 'grab'
                    group.on('pointerdown', (e: any) => {
                        dragging = true
                        dragOffset = { x: e.global.x - group.x, y: e.global.y - group.y }
                        onSelectOperation?.(op.id)
                    })
                    group.on('globalpointermove', (e: any) => {
                        if (!dragging) return
                        group.x = e.global.x - dragOffset.x
                        group.y = e.global.y - dragOffset.y
                    })
                    group.on('pointerup', () => {
                        if (dragging) {
                            dragging = false
                            onPositionChange?.(op.id, { x: group.x, y: group.y })
                        }
                    })
                    group.on('pointerupoutside', () => { dragging = false })

                    const pos = resolvePosition(op.params.position || 'bottom-right', CANVAS_W, CANVAS_H)
                    group.x = pos.x - size / 2
                    group.y = pos.y - (size * 0.6) / 2

                    container.addChild(group)
                    existingIds.set(op.id, group)
                }

            } else if (hint === 'crop-guide') {
                if (!overlay) {
                    const g = new Graphics()
                    // Dashed-look crop guide
                    const aspect = op.params.aspectRatio || '9:16'
                    const [rw, rh] = aspect.split(':').map(Number)
                    const cropAspect = rw / rh
                    const canvasAspect = CANVAS_W / CANVAS_H
                    let cropW: number, cropH: number

                    if (cropAspect > canvasAspect) {
                        cropW = CANVAS_W
                        cropH = CANVAS_W / cropAspect
                    } else {
                        cropH = CANVAS_H
                        cropW = CANVAS_H * cropAspect
                    }

                    const x = (CANVAS_W - cropW) / 2
                    const y = (CANVAS_H - cropH) / 2

                    // Darkened outside area
                    g.rect(0, 0, CANVAS_W, CANVAS_H)
                    g.fill({ color: 0x000000, alpha: 0.5 })
                    g.rect(x, y, cropW, cropH)
                    g.cut()

                    // Crop border
                    g.rect(x, y, cropW, cropH)
                    g.stroke({ color: 0xffffff, width: 2 })

                    g.label = op.id
                    container.addChild(g)
                    existingIds.set(op.id, g as any)
                }

            } else if (hint === 'blur-region') {
                if (!overlay) {
                    const g = new Graphics()
                    const region = op.params.region || { x: 0, y: 0, w: 100, h: 100 }
                    const scaleX = CANVAS_W / 1920 // normalize to canvas
                    const scaleY = CANVAS_H / 1080

                    g.rect(
                        region.x * scaleX,
                        region.y * scaleY,
                        region.w * scaleX,
                        region.h * scaleY,
                    )
                    g.fill({ color: 0x3b82f6, alpha: 0.3 })
                    g.stroke({ color: 0x3b82f6, width: 2, alpha: 0.7 })

                    const label = new Text({
                        text: '🔵 Blur',
                        style: new TextStyle({ fontSize: 10, fill: '#60a5fa', fontFamily: 'Arial' }),
                    })
                    label.x = region.x * scaleX + 4
                    label.y = region.y * scaleY + 4

                    const group = new Container()
                    group.addChild(g, label)
                    group.label = op.id
                    container.addChild(group)
                    existingIds.set(op.id, group)
                }
            }
        }

        // Highlight selected
        for (const [id, sprite] of existingIds) {
            sprite.alpha = id === selectedOpId ? 1.0 : 0.85
        }
    }, [operations, plugins, selectedOpId, onPositionChange, onSelectOperation])

    // ── Transport Controls ────────────────────────────
    const togglePlay = useCallback(() => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) {
            video.play()
            setIsPlaying(true)
        } else {
            video.pause()
            setIsPlaying(false)
        }
    }, [])

    const seek = useCallback((time: number) => {
        const video = videoRef.current
        if (!video) return
        video.currentTime = time
        setCurrentTime(time)
    }, [])

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = Math.floor(sec % 60)
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    if (initError) {
        return (
            <div className="flex flex-col items-center justify-center gap-3" style={{ width: CANVAS_W, height: CANVAS_H }}>
                <div className="text-4xl">🎬</div>
                <p className="text-sm text-slate-400 text-center max-w-xs">{initError}</p>
                <button
                    onClick={() => { setInitError(null) }}
                    className="px-4 py-2 text-sm rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium transition cursor-pointer"
                >Retry</button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Canvas */}
            <div
                ref={containerRef}
                className="rounded-xl overflow-hidden shadow-lg border-2 border-slate-700/30 bg-slate-900"
                style={{ width: CANVAS_W, height: CANVAS_H }}
            />

            {/* Transport controls */}
            <div className="w-full max-w-sm flex flex-col gap-1.5">
                {/* Seekbar */}
                <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => seek(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />

                {/* Play button + time */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={togglePlay}
                        className="w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition shadow-lg cursor-pointer text-sm"
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <span className="text-xs font-mono text-slate-400">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    {!videoSrc && (
                        <span className="text-[10px] text-slate-500">No video loaded</span>
                    )}
                </div>
            </div>
        </div>
    )
}

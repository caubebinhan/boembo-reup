/**
 * VideoCompositor — PixiJS v8 Live Video Preview
 * ─────────────────────────────────────────────────
 * pixi.js/unsafe-eval is imported as a SIDE EFFECT only to
 * register the unsafe-eval renderer extension. All named
 * exports come from 'pixi.js' as normal.
 */

// ⚡ Side-effect import — enables unsafe-eval support in Electron CSP
import 'pixi.js/unsafe-eval'

import {
    Application,
    Sprite,
    Text,
    TextStyle,
    Graphics,
    Texture,
    Container,
} from 'pixi.js'
import { useRef, useEffect, useCallback, useState } from 'react'

const LOG = (...args: any[]) => console.log('[VideoCompositor]', ...args)
const LOGW = (...args: any[]) => console.warn('[VideoCompositor]', ...args)
const LOGE = (...args: any[]) => console.error('[VideoCompositor]', ...args)

// ── Types ──────────────────────────────────────────────
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
    videoSrc: string | null
    operations: VideoEditOperation[]
    plugins: PluginMeta[]
    selectedOpId: string | null
    onPositionChange?: (opId: string, position: { x: number; y: number }) => void
    onResizeChange?: (opId: string, rect: { x: number; y: number; w: number; h: number }) => void
    onSelectOperation?: (opId: string) => void
    onTimeUpdate?: (currentTime: number, duration: number) => void
}

// ── Position resolver ──────────────────────────────────
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

// ── Resize handle helper ──────────────────────────────
function createResizeHandle(g: Graphics, size: number, color: number) {
    g.roundRect(-size / 2, -size / 2, size, size, 2)
    g.fill({ color, alpha: 1 })
    g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 })
}

// ── Main Component ────────────────────────────────────
export function VideoCompositor({
    videoSrc,
    operations,
    plugins,
    selectedOpId,
    onPositionChange,
    onResizeChange,
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
    const [appReady, setAppReady] = useState(false)

    const CANVAS_W = 360
    const CANVAS_H = 640

    // ── Init PixiJS ────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return
        LOG('Initializing PixiJS (unsafe-eval mode)')

        let destroyed = false
        let initialized = false
        const app = new Application()

        const initApp = async () => {
            try {
                await app.init({
                    width: CANVAS_W,
                    height: CANVAS_H,
                    backgroundColor: 0x2c2a29,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true,
                })
                LOG('PixiJS initialized OK')
            } catch (err: any) {
                LOGE('PixiJS init failed:', err)
                setInitError(err?.message || 'Failed to initialize video preview')
                return
            }

            if (destroyed) {
                try { app.destroy(true) } catch { /* safe */ }
                return
            }

            initialized = true
            if (!containerRef.current) return
            containerRef.current.innerHTML = ''
            containerRef.current.appendChild(app.canvas as HTMLCanvasElement)

            const overlays = new Container()
            overlays.label = 'overlays'
            app.stage.addChild(overlays)
            overlayContainerRef.current = overlays

            appRef.current = app
            setAppReady(true)
            LOG('Canvas mounted, overlays container ready')
        }

        initApp()

        return () => {
            destroyed = true
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            if (initialized) {
                try { app.destroy(true) } catch (err) {
                    LOGW('destroy error (safe to ignore):', err)
                }
            }
            appRef.current = null
        }
    }, [])

    // ── Load Video ─────────────────────────────────────
    useEffect(() => {
        const app = appRef.current
        if (!appReady || !app || !videoSrc) return
        LOG(`Loading video: ${videoSrc}`)

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

        const video = document.createElement('video')
        // Only set crossOrigin for remote URLs — local files break with CORS
        if (videoSrc.startsWith('http://') || videoSrc.startsWith('https://')) {
            video.crossOrigin = 'anonymous'
        }
        video.loop = true
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'
        videoRef.current = video

        let mounted = true

        const onMetadata = () => {
            if (!mounted) return
            LOG(`Video metadata loaded: ${video.videoWidth}x${video.videoHeight}, duration=${video.duration}s`)
            setDuration(video.duration)

            const texture = Texture.from(video, { autoUpdate: true } as any)
            const sprite = new Sprite(texture)

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

            if (overlayContainerRef.current) {
                app.stage.addChild(overlayContainerRef.current)
            }
            LOG('Video sprite added to stage')

            // Auto-play then pause on first frame for preview
            video.play().then(() => {
                setTimeout(() => {
                    if (mounted && video) {
                        video.pause()
                        video.currentTime = 0
                        setIsPlaying(false)
                    }
                }, 100)
            }).catch(err => LOGW('Auto-play failed (expected):', err?.message))
        }

        video.addEventListener('loadedmetadata', onMetadata)
        video.addEventListener('error', () => {
            LOGE('Video load error:', video.error?.code, video.error?.message, 'src:', videoSrc)
        })

        // Set src and trigger load
        video.src = videoSrc
        video.load()
        LOG('video.src set, load() called')

        const tick = () => {
            if (video && !video.paused) {
                setCurrentTime(video.currentTime)
                onTimeUpdate?.(video.currentTime, video.duration)
            }
            rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)

        return () => {
            mounted = false
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            video.removeEventListener('loadedmetadata', onMetadata)
        }
    }, [videoSrc, appReady, onTimeUpdate])

    // ── Build draggable + resizable group ─────────────
    const buildDraggableResizable = useCallback((
        op: VideoEditOperation,
        buildShape: (cx: Container, w: number, h: number) => void,
        initialX: number,
        initialY: number,
        initialW: number,
        initialH: number,
        accentColor: number,
    ) => {
        LOG(`buildDraggableResizable op=${op.id} pluginId=${op.pluginId} x=${initialX} y=${initialY} w=${initialW} h=${initialH}`)

        const group = new Container()
        group.x = initialX
        group.y = initialY
        group.eventMode = 'static'
        group.cursor = 'move'

        let gW = initialW
        let gH = initialH

        const shapeContainer = new Container()
        group.addChild(shapeContainer)

        const redrawShape = (w: number, h: number) => {
            shapeContainer.removeChildren()
            const tempContainer = new Container()
            buildShape(tempContainer, w, h)
            for (const child of [...tempContainer.children]) {
                shapeContainer.addChild(child)
            }
            tempContainer.destroy()
        }
        redrawShape(gW, gH)

        const HW = 8
        const handles: Graphics[] = []
        const handleAnchors = [
            { ax: 0, ay: 0, cx: 'nw-resize' },
            { ax: 0.5, ay: 0, cx: 'n-resize' },
            { ax: 1, ay: 0, cx: 'ne-resize' },
            { ax: 1, ay: 0.5, cx: 'e-resize' },
            { ax: 1, ay: 1, cx: 'se-resize' },
            { ax: 0.5, ay: 1, cx: 's-resize' },
            { ax: 0, ay: 1, cx: 'sw-resize' },
            { ax: 0, ay: 0.5, cx: 'w-resize' },
        ]

        const handlesContainer = new Container()
        group.addChild(handlesContainer)

        const updateHandlePositions = (w: number, h: number) => {
            handleAnchors.forEach((anchor, i) => {
                if (handles[i]) {
                    handles[i].x = anchor.ax * w
                    handles[i].y = anchor.ay * h
                }
            })
        }

        handleAnchors.forEach((anchor, i) => {
            const hg = new Graphics()
            createResizeHandle(hg, HW, accentColor)
            hg.eventMode = 'static'
            hg.cursor = anchor.cx
            hg.x = anchor.ax * gW
            hg.y = anchor.ay * gH

            let resizeDragging = false
            let startMouseX = 0, startMouseY = 0
            let startGroupX = 0, startGroupY = 0, startW = 0, startH = 0

            hg.on('pointerdown', (e: any) => {
                e.stopPropagation()
                resizeDragging = true
                startMouseX = e.global.x
                startMouseY = e.global.y
                startGroupX = group.x
                startGroupY = group.y
                startW = gW
                startH = gH
                LOG(`[drag-resize:start] op=${op.id} handle=${i} (${anchor.cx})`)
            })
            hg.on('globalpointermove', (e: any) => {
                if (!resizeDragging) return
                const dx = e.global.x - startMouseX
                const dy = e.global.y - startMouseY
                let nx = startGroupX, ny = startGroupY, nw = startW, nh = startH
                if (anchor.ax === 0) { nx = startGroupX + dx; nw = Math.max(30, startW - dx) }
                if (anchor.ax === 1) { nw = Math.max(30, startW + dx) }
                if (anchor.ay === 0) { ny = startGroupY + dy; nh = Math.max(20, startH - dy) }
                if (anchor.ay === 1) { nh = Math.max(20, startH + dy) }
                group.x = nx; group.y = ny; gW = nw; gH = nh
                redrawShape(nw, nh)
                updateHandlePositions(nw, nh)
            })
            hg.on('pointerup', () => {
                if (resizeDragging) {
                    resizeDragging = false
                    LOG(`[drag-resize:end] op=${op.id} → x=${group.x.toFixed(1)} y=${group.y.toFixed(1)} w=${gW.toFixed(1)} h=${gH.toFixed(1)}`)
                    onResizeChange?.(op.id, { x: group.x, y: group.y, w: gW, h: gH })
                }
            })
            hg.on('pointerupoutside', () => { resizeDragging = false })

            handles.push(hg)
            handlesContainer.addChild(hg)
        })

        // Drag the whole group
        let dragging = false
        let dragOffset = { x: 0, y: 0 }
        group.on('pointerdown', (e: any) => {
            dragging = true
            dragOffset = { x: e.global.x - group.x, y: e.global.y - group.y }
            LOG(`[drag:start] op=${op.id} selecting`)
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
                LOG(`[drag:end] op=${op.id} → x=${group.x.toFixed(1)} y=${group.y.toFixed(1)}`)
                onPositionChange?.(op.id, { x: group.x, y: group.y })
            }
        })
        group.on('pointerupoutside', () => { dragging = false })

        return group
    }, [onPositionChange, onResizeChange, onSelectOperation])

    // ── Sync Overlays ──────────────────────────────────
    useEffect(() => {
        const container = overlayContainerRef.current
        if (!container) return

        LOG(`Syncing overlays. ops=${operations.length} selectedOpId=${selectedOpId}`)

        const currentIds = new Set(operations.filter(o => o.enabled).map(o => o.id))
        const existingIds = overlayMapRef.current

        // Remove stale
        for (const [id, sprite] of existingIds) {
            if (!currentIds.has(id)) {
                LOG(`Removing stale overlay id=${id}`)
                container.removeChild(sprite)
                sprite.destroy({ children: true })
                existingIds.delete(id)
            }
        }

        for (const op of operations) {
            if (!op.enabled) continue
            const plugin = plugins.find(p => p.id === op.pluginId)
            if (!plugin) continue
            const hint = plugin.previewHint || 'none'
            if (hint === 'none') continue

            const existing = existingIds.get(op.id)
            if (existing) continue // already rendered

            LOG(`Creating overlay op=${op.id} pluginId=${op.pluginId} hint=${hint}`)

            if (hint === 'overlay-text') {
                const text = op.params.text || 'Sample Text'
                const fontSize = Math.max(12, Math.min(60, op.params.fontSize || 24))
                const fontColor = op.params.fontColor || '#f8e8d5'
                const textW = Math.max(80, fontSize * text.length * 0.6 + 20)
                const textH = Math.max(36, fontSize + 16)

                const buildShape = (cx: Container, w: number, h: number) => {
                    const bg = new Graphics()
                    bg.roundRect(0, 0, w, h, 6)
                    bg.fill({ color: 0x2d1b4e, alpha: 0.45 })
                    bg.stroke({ color: 0xc9a0dc, width: 1.5, alpha: 0.6 })
                    const tClone = new Text({
                        text: op.params.text || 'Sample Text',
                        style: new TextStyle({
                            fontFamily: 'Georgia, serif',
                            fontSize: Math.max(10, Math.min(w / 4, fontSize)),
                            fill: fontColor,
                        }),
                    })
                    tClone.anchor.set(0.5)
                    tClone.x = w / 2
                    tClone.y = h / 2
                    cx.addChild(bg, tClone)
                }

                const pos = resolvePosition(op.params.position || 'bottom-center', CANVAS_W, CANVAS_H)
                const group = buildDraggableResizable(op, buildShape, pos.x - textW / 2, pos.y - textH / 2, textW, textH, 0xc9a0dc)
                container.addChild(group)
                existingIds.set(op.id, group)

            } else if (hint === 'overlay-image') {
                const sizePercent = op.params.size || 15
                const w = Math.round(CANVAS_W * (sizePercent / 100))
                const h = Math.round(w * 0.6)
                const opacity = op.params.opacity ?? 0.85

                const buildShape = (cx: Container, bw: number, bh: number) => {
                    const g = new Graphics()
                    g.roundRect(0, 0, bw, bh, 8)
                    g.fill({ color: 0x6b3fa0, alpha: opacity * 0.6 })
                    g.stroke({ color: 0xe8c5f5, width: 1.5, alpha: 0.8 })
                    const label = new Text({
                        text: `${plugin.icon} ${plugin.name}`,
                        style: new TextStyle({ fontSize: 11, fill: '#f0d9ff', fontFamily: 'Georgia, serif' }),
                    })
                    label.x = 6; label.y = 6
                    cx.addChild(g, label)
                }

                const pos = resolvePosition(op.params.position || 'bottom-right', CANVAS_W, CANVAS_H)
                const group = buildDraggableResizable(op, buildShape, pos.x - w / 2, pos.y - h / 2, w, h, 0xd4a0e8)
                container.addChild(group)
                existingIds.set(op.id, group)

            } else if (hint === 'crop-guide') {
                const aspect = op.params.aspectRatio || '9:16'
                const [rw, rh] = aspect.split(':').map(Number)
                const cropAspect = rw / rh
                const canvasAspect = CANVAS_W / CANVAS_H
                let cropW: number, cropH: number

                if (cropAspect > canvasAspect) {
                    cropW = CANVAS_W; cropH = CANVAS_W / cropAspect
                } else {
                    cropH = CANVAS_H; cropW = CANVAS_H * cropAspect
                }

                const cx = (CANVAS_W - cropW) / 2
                const cy = (CANVAS_H - cropH) / 2

                LOG(`crop-guide aspect=${aspect} cropW=${cropW.toFixed(0)} cropH=${cropH.toFixed(0)}`)

                const buildShape = (cont: Container, bw: number, bh: number) => {
                    const dark = new Graphics()
                    dark.rect(-cx, -cy, CANVAS_W, CANVAS_H)
                    dark.fill({ color: 0x0d0617, alpha: 0.62 })
                    dark.rect(0, 0, bw, bh)
                    dark.cut()
                    cont.addChild(dark)

                    const border = new Graphics()
                    border.rect(0, 0, bw, bh)
                    border.stroke({ color: 0xf5c5e8, width: 2 })
                    cont.addChild(border)

                    const grid = new Graphics()
                    for (let i = 1; i <= 2; i++) {
                        grid.moveTo(bw * i / 3, 0); grid.lineTo(bw * i / 3, bh)
                        grid.moveTo(0, bh * i / 3); grid.lineTo(bw, bh * i / 3)
                    }
                    grid.stroke({ color: 0xffffff, width: 0.5, alpha: 0.25 })
                    cont.addChild(grid)
                }

                const group = buildDraggableResizable(op, buildShape, cx, cy, cropW, cropH, 0xf5c5e8)
                container.addChild(group)
                existingIds.set(op.id, group)

            } else if (hint === 'blur-region') {
                const region = op.params.region || { x: 60, y: 200, w: 200, h: 120 }
                const scaleX = CANVAS_W / 1920
                const scaleY = CANVAS_H / 1080
                const bx = region.x * scaleX
                const by = region.y * scaleY
                const bw = region.w * scaleX
                const bh = region.h * scaleY

                LOG(`blur-region region=${JSON.stringify(region)} → canvas x=${bx.toFixed(1)} y=${by.toFixed(1)} w=${bw.toFixed(1)} h=${bh.toFixed(1)}`)

                const buildShape = (cont: Container, w: number, h: number) => {
                    const g = new Graphics()
                    g.roundRect(0, 0, w, h, 6)
                    g.fill({ color: 0x89a0f0, alpha: 0.3 })
                    g.stroke({ color: 0xa0b4ff, width: 2, alpha: 0.9 })
                    const label = new Text({
                        text: '⬡ Blur',
                        style: new TextStyle({ fontSize: 11, fill: '#c5d4ff', fontFamily: 'Georgia, serif' }),
                    })
                    label.x = 6; label.y = 4
                    cont.addChild(g, label)
                }

                const group = buildDraggableResizable(op, buildShape, bx, by, bw, bh, 0xa0b4ff)
                container.addChild(group)
                existingIds.set(op.id, group)
            }
        }

        // Selection highlight
        for (const [id, overlay] of existingIds) {
            overlay.alpha = id === selectedOpId ? 1.0 : 0.75
        }
    }, [operations, plugins, selectedOpId, buildDraggableResizable])

    // ── Transport Controls ─────────────────────────────
    const togglePlay = useCallback(() => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) {
            video.play()
            setIsPlaying(true)
            LOG('Play')
        } else {
            video.pause()
            setIsPlaying(false)
            LOG('Pause')
        }
    }, [])

    const seek = useCallback((time: number) => {
        const video = videoRef.current
        if (!video) return
        LOG(`Seek → ${time.toFixed(2)}s`)
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
                <p className="text-sm text-center max-w-xs" style={{ color: '#c9a0dc' }}>{initError}</p>
                <button
                    onClick={() => setInitError(null)}
                    className="px-4 py-2 text-sm rounded-xl text-white font-medium transition cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #c084fc)' }}
                >Retry</button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Canvas with vintage pastel glow */}
            <div
                ref={containerRef}
                className="rounded-2xl overflow-hidden"
                style={{
                    width: CANVAS_W,
                    height: CANVAS_H,
                    boxShadow: '0 0 0 2px rgba(201,160,220,0.3), 0 8px 40px rgba(107,63,160,0.4)',
                }}
            />

            {/* Transport */}
            <div className="w-full max-w-sm flex flex-col gap-2">
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#e8e4db' }}>
                    <div
                        className="absolute top-0 left-0 h-full rounded-full"
                        style={{
                            width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                            background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                        }}
                    />
                    <input
                        type="range"
                        min={0}
                        max={duration || 1}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => seek(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <button
                        onClick={togglePlay}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm transition shadow-lg cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <span className="text-xs font-mono" style={{ color: '#5c5551' }}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    {!videoSrc && (
                        <span className="text-[10px]" style={{ color: '#8a827c' }}>No video</span>
                    )}
                </div>
            </div>
        </div>
    )
}

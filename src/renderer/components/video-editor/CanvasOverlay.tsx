/**
 * CanvasOverlay — Interactive drag-handles for visual video-edit operations
 * ─────────────────────────────────────────────────────────────────────────
 * Renders on top of the <video> element.
 * Supports:
 *   • crop-guide / blur-region — draggable + resizable rectangle
 *   • overlay-image / overlay-text — draggable position indicator
 *   • transform / none — no overlay
 */
import { useRef, useCallback, useState, useEffect } from 'react'
import type { PluginMeta, VideoEditOperation } from './types'
import { V } from './types'

interface CanvasOverlayProps {
  /** Displayed video width/height (px) */
  videoWidth: number
  videoHeight: number
  /** Currently selected operation */
  operation: VideoEditOperation | null
  /** Plugin metadata for the selected operation */
  plugin: PluginMeta | null
  /** Update params callback */
  onUpdateParams: (opId: string, params: Record<string, any>) => void
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null
const HANDLE = 10

export function CanvasOverlay({
  videoWidth: vw, videoHeight: vh,
  operation, plugin, onUpdateParams,
}: CanvasOverlayProps) {
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const start = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0 })
  const pointerIdRef = useRef<number | null>(null)

  // Reset drag when operation changes
  useEffect(() => {
    setDragMode(null)
    pointerIdRef.current = null
  }, [operation?.id])

  if (!operation || !plugin || vw === 0 || vh === 0) return null
  const hint = plugin.previewHint || 'none'
  if (hint === 'none' || hint === 'transform') return null

  const isRegion = hint === 'crop-guide' || hint === 'blur-region'

  // ── Region (crop / blur) ──────────────────────────
  if (isRegion) {
    const regionKey = operation.params.region ? 'region' : 'cropRegion'
    const region = operation.params[regionKey] || { x: 10, y: 10, w: 80, h: 80 }
    const rx = (region.x / 100) * vw
    const ry = (region.y / 100) * vh
    const rw = (region.w / 100) * vw
    const rh = (region.h / 100) * vh
    const color = hint === 'crop-guide' ? V.accent : '#3b82f6'

    const clamp = (r: typeof region) => ({
      x: Math.max(0, Math.min(100 - r.w, r.x)),
      y: Math.max(0, Math.min(100 - r.h, r.y)),
      w: Math.max(5, Math.min(100, r.w)),
      h: Math.max(5, Math.min(100, r.h)),
    })
    const set = (r: typeof region) =>
      onUpdateParams(operation.id, { ...operation.params, [regionKey]: clamp(r) })

    const down = (e: React.PointerEvent, mode: DragMode) => {
      e.preventDefault(); e.stopPropagation()
      setDragMode(mode)
      pointerIdRef.current = e.pointerId
      e.currentTarget.setPointerCapture?.(e.pointerId)
      start.current = { mx: e.clientX, my: e.clientY, ox: region.x, oy: region.y, ow: region.w, oh: region.h }
    }

    /* eslint-disable react-hooks/rules-of-hooks */
    const move = useCallback((e: PointerEvent) => {
      if (!dragMode) return
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return
      const dx = ((e.clientX - start.current.mx) / vw) * 100
      const dy = ((e.clientY - start.current.my) / vh) * 100
      const { ox, oy, ow, oh } = start.current
      if (dragMode === 'move') set({ x: ox + dx, y: oy + dy, w: ow, h: oh })
      else if (dragMode === 'se') set({ x: ox, y: oy, w: ow + dx, h: oh + dy })
      else if (dragMode === 'nw') set({ x: ox + dx, y: oy + dy, w: ow - dx, h: oh - dy })
      else if (dragMode === 'ne') set({ x: ox, y: oy + dy, w: ow + dx, h: oh - dy })
      else if (dragMode === 'sw') set({ x: ox + dx, y: oy, w: ow - dx, h: oh + dy })
    }, [dragMode, vw, vh, operation.id, operation.params])

    const up = useCallback((e?: PointerEvent) => {
      if (pointerIdRef.current !== null && e && e.pointerId !== pointerIdRef.current) return
      pointerIdRef.current = null
      setDragMode(null)
    }, [])

    useEffect(() => {
      if (!dragMode) return
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      return () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
    }, [dragMode, move, up])
    /* eslint-enable react-hooks/rules-of-hooks */

    const hStyle = (c: string): React.CSSProperties => {
      const b: React.CSSProperties = {
        position: 'absolute', width: HANDLE, height: HANDLE,
        background: '#fff', border: `2px solid ${color}`, borderRadius: 2, zIndex: 2,
        cursor: `${c}-resize`,
      }
      const half = -HANDLE / 2
      if (c === 'nw') return { ...b, top: half, left: half }
      if (c === 'ne') return { ...b, top: half, right: half }
      if (c === 'sw') return { ...b, bottom: half, left: half }
      return { ...b, bottom: half, right: half } // se
    }

    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
        {hint === 'crop-guide' && (
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.35 }}>
            <defs><mask id="cm"><rect width="100%" height="100%" fill="white" /><rect x={rx} y={ry} width={rw} height={rh} fill="black" /></mask></defs>
            <rect width="100%" height="100%" fill="black" mask="url(#cm)" />
          </svg>
        )}
        <div className="absolute pointer-events-auto"
          style={{ left: rx, top: ry, width: rw, height: rh, border: `2px solid ${color}`, cursor: dragMode === 'move' ? 'grabbing' : 'grab', boxShadow: `0 0 0 1px ${color}44`, touchAction: 'none' }}
          onPointerDown={e => down(e, 'move')}>
          <div style={hStyle('nw')} className="pointer-events-auto" onPointerDown={e => down(e, 'nw')} />
          <div style={hStyle('ne')} className="pointer-events-auto" onPointerDown={e => down(e, 'ne')} />
          <div style={hStyle('sw')} className="pointer-events-auto" onPointerDown={e => down(e, 'sw')} />
          <div style={hStyle('se')} className="pointer-events-auto" onPointerDown={e => down(e, 'se')} />
          <div className="absolute -top-6 left-0 text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: color, color: '#fff', whiteSpace: 'nowrap' }}>
            {Math.round(region.w)}% × {Math.round(region.h)}%
          </div>
        </div>
      </div>
    )
  }

  // ── Overlay position (watermark, text) ────────────
  const pos = operation.params.position || 'center'
  const posMap: Record<string, { x: number; y: number }> = {
    'top-left': { x: 10, y: 10 }, 'top-center': { x: 50, y: 10 }, 'top-right': { x: 90, y: 10 },
    'center-left': { x: 10, y: 50 }, 'center': { x: 50, y: 50 }, 'center-right': { x: 90, y: 50 },
    'bottom-left': { x: 10, y: 90 }, 'bottom-center': { x: 50, y: 90 }, 'bottom-right': { x: 90, y: 90 },
  }
  const p = typeof pos === 'string' ? (posMap[pos] || posMap.center) : { x: pos.x ?? 50, y: pos.y ?? 50 }
  const px = (p.x / 100) * vw
  const py = (p.y / 100) * vh
  const sz = 36
  const emoji = hint === 'overlay-image' ? '🖼️' : '✏️'

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <div className="absolute pointer-events-auto flex items-center justify-center rounded-xl cursor-grab active:cursor-grabbing"
        style={{
          left: px - sz / 2, top: py - sz / 2, width: sz, height: sz,
          background: `${V.accent}cc`, color: '#fff', border: '2px solid #fff',
          boxShadow: `0 2px 12px ${V.accent}66`, fontSize: 16,
        }}
        title={typeof pos === 'string' ? pos : `${Math.round(p.x)}%, ${Math.round(p.y)}%`}>
        {emoji}
      </div>
      <div className="absolute text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none"
        style={{ left: px + sz / 2 + 4, top: py - 8, background: `${V.accent}cc`, color: '#fff', whiteSpace: 'nowrap' }}>
        {typeof pos === 'string' ? pos : `${Math.round(p.x)}%, ${Math.round(p.y)}%`}
      </div>
    </div>
  )
}

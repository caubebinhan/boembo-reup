/**
 * CanvasOverlay — Interactive drag-handles for visual video-edit operations.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { PluginMeta, VideoEditOperation } from './types'
import { V } from './types'
import { applyCanvasRect, clampCanvasRect, resolveCanvasRect, resolveCanvasSpace } from './canvas-contracts'

interface CanvasOverlayProps {
  videoWidth: number
  videoHeight: number
  operation: VideoEditOperation | null
  plugin: PluginMeta | null
  operations: VideoEditOperation[]
  onUpdateParams: (opId: string, params: Record<string, unknown>) => void
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

const HANDLE = 10

interface RectPct {
  x: number
  y: number
  w: number
  h: number
}

function applyDrag(mode: DragMode, base: RectPct, dx: number, dy: number): RectPct {
  if (mode === 'move') return { x: base.x + dx, y: base.y + dy, w: base.w, h: base.h }
  if (mode === 'se') return { x: base.x, y: base.y, w: base.w + dx, h: base.h + dy }
  if (mode === 'nw') return { x: base.x + dx, y: base.y + dy, w: base.w - dx, h: base.h - dy }
  if (mode === 'ne') return { x: base.x, y: base.y + dy, w: base.w + dx, h: base.h - dy }
  if (mode === 'sw') return { x: base.x + dx, y: base.y, w: base.w - dx, h: base.h + dy }
  return base
}

function handleStyle(color: string, corner: 'nw' | 'ne' | 'sw' | 'se'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    background: '#fff',
    border: `2px solid ${color}`,
    borderRadius: 2,
    zIndex: 2,
    cursor: `${corner}-resize`,
  }
  const half = -HANDLE / 2
  if (corner === 'nw') return { ...base, top: half, left: half }
  if (corner === 'ne') return { ...base, top: half, right: half }
  if (corner === 'sw') return { ...base, bottom: half, left: half }
  return { ...base, bottom: half, right: half }
}

export function CanvasOverlay({
  videoWidth: vw,
  videoHeight: vh,
  operation,
  plugin,
  operations,
  onUpdateParams,
}: CanvasOverlayProps): ReactElement | null {
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const pointerIdRef = useRef<number | null>(null)
  const startRef = useRef<{ mx: number; my: number; ox: number; oy: number; ow: number; oh: number }>({
    mx: 0,
    my: 0,
    ox: 0,
    oy: 0,
    ow: 0,
    oh: 0,
  })
  const runtimeRef = useRef({
    operation,
    plugin,
    operations,
    videoWidth: vw,
    videoHeight: vh,
    onUpdateParams,
  })

  useEffect(() => {
    runtimeRef.current = {
      operation,
      plugin,
      operations,
      videoWidth: vw,
      videoHeight: vh,
      onUpdateParams,
    }
  }, [operation, plugin, operations, vw, vh, onUpdateParams])

  useEffect(() => {
    pointerIdRef.current = null
  }, [operation?.id])

  const stopDrag = useCallback((e?: PointerEvent) => {
    if (pointerIdRef.current !== null && e && e.pointerId !== pointerIdRef.current) return
    pointerIdRef.current = null
    setDragMode(null)
  }, [])

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragMode) return
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return

    const { operation: op, plugin: pl, operations: ops, videoWidth, videoHeight, onUpdateParams: update } = runtimeRef.current
    if (!op || !pl || videoWidth <= 0 || videoHeight <= 0) return

    const space = resolveCanvasSpace(op, pl, ops, videoWidth > 0 && videoHeight > 0 ? (videoWidth / videoHeight) : null)
    const spacePixelW = Math.max(1, (space.w / 100) * videoWidth)
    const spacePixelH = Math.max(1, (space.h / 100) * videoHeight)
    const dx = ((e.clientX - startRef.current.mx) / spacePixelW) * 100
    const dy = ((e.clientY - startRef.current.my) / spacePixelH) * 100
    const base: RectPct = {
      x: startRef.current.ox,
      y: startRef.current.oy,
      w: startRef.current.ow,
      h: startRef.current.oh,
    }
    const nextRect = clampCanvasRect(applyDrag(dragMode, base, dx, dy))
    const nextParams = applyCanvasRect(op, pl, nextRect)
    update(op.id, nextParams)
  }, [dragMode])

  useEffect(() => {
    if (!dragMode) return
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [dragMode, onMove, stopDrag])

  if (!operation || !plugin || vw === 0 || vh === 0) return null

  const hint = plugin.previewHint || 'none'
  if (hint === 'none' || hint === 'transform') return null

  const rect = resolveCanvasRect(operation, plugin)
  if (!rect) return null
  const spaceRect = resolveCanvasSpace(operation, plugin, operations, vw > 0 && vh > 0 ? (vw / vh) : null)

  const spacePxX = (spaceRect.x / 100) * vw
  const spacePxY = (spaceRect.y / 100) * vh
  const spacePxW = (spaceRect.w / 100) * vw
  const spacePxH = (spaceRect.h / 100) * vh
  const rx = spacePxX + (rect.x / 100) * spacePxW
  const ry = spacePxY + (rect.y / 100) * spacePxH
  const rw = (rect.w / 100) * spacePxW
  const rh = (rect.h / 100) * spacePxH

  const isRegion = hint === 'crop-guide' || hint === 'blur-region'
  const hasScopedSpace = spaceRect.x > 0 || spaceRect.y > 0 || spaceRect.w < 100 || spaceRect.h < 100
  const color = hint === 'crop-guide' ? V.accent : hint === 'blur-region' ? '#3b82f6' : hint === 'overlay-image' ? V.accent : '#e67e22'
  const emoji = hint === 'overlay-image' ? '🖼️' : '✏️'

  const beginDrag = (e: React.PointerEvent, mode: DragMode): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragMode(mode)
    pointerIdRef.current = e.pointerId
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startRef.current = {
      mx: e.clientX,
      my: e.clientY,
      ox: rect.x,
      oy: rect.y,
      ow: rect.w,
      oh: rect.h,
    }
  }

  if (isRegion) {
    const maskId = `crop-mask-${operation.id}`
    const maskRect = hint === 'crop-guide'
      ? { x: rx, y: ry, w: rw, h: rh }
      : { x: spacePxX, y: spacePxY, w: spacePxW, h: spacePxH }
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
        {(hint === 'crop-guide' || hasScopedSpace) && (
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: hint === 'crop-guide' ? 0.35 : 0.22 }}>
            <defs>
              <mask id={maskId}>
                <rect width="100%" height="100%" fill="white" />
                <rect x={maskRect.x} y={maskRect.y} width={maskRect.w} height={maskRect.h} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="black" mask={`url(#${maskId})`} />
          </svg>
        )}
        {hasScopedSpace && hint === 'blur-region' && (
          <div
            className="absolute"
            style={{
              left: spacePxX,
              top: spacePxY,
              width: spacePxW,
              height: spacePxH,
              border: '1px dashed #60a5fa88',
              boxShadow: 'inset 0 0 0 1px #60a5fa33',
            }}
          />
        )}
        <div
          className="absolute pointer-events-auto"
          style={{
            left: rx,
            top: ry,
            width: rw,
            height: rh,
            border: `2px solid ${color}`,
            cursor: dragMode === 'move' ? 'grabbing' : 'grab',
            boxShadow: `0 0 0 1px ${color}44`,
            touchAction: 'none',
          }}
          onPointerDown={(e) => beginDrag(e, 'move')}
        >
          <div style={handleStyle(color, 'nw')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'nw')} />
          <div style={handleStyle(color, 'ne')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'ne')} />
          <div style={handleStyle(color, 'sw')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'sw')} />
          <div style={handleStyle(color, 'se')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'se')} />
          <div
            className="absolute -top-6 left-0 text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: color, color: '#fff', whiteSpace: 'nowrap' }}
          >
            {Math.round(rect.w)}% × {Math.round(rect.h)}%
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <div
        className="absolute pointer-events-auto"
        style={{
          left: rx,
          top: ry,
          width: rw,
          height: rh,
          border: `2px dashed ${color}`,
          cursor: dragMode === 'move' ? 'grabbing' : 'grab',
          boxShadow: `0 0 0 1px ${color}44`,
          touchAction: 'none',
          borderRadius: 8,
          background: `${color}11`,
        }}
        onPointerDown={(e) => beginDrag(e, 'move')}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ fontSize: 20, opacity: 0.7 }}>
          {emoji}
        </div>
        <div style={handleStyle(color, 'nw')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'nw')} />
        <div style={handleStyle(color, 'ne')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'ne')} />
        <div style={handleStyle(color, 'sw')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'sw')} />
        <div style={handleStyle(color, 'se')} className="pointer-events-auto" onPointerDown={(e) => beginDrag(e, 'se')} />
        <div
          className="absolute -top-6 left-0 text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: color, color: '#fff', whiteSpace: 'nowrap' }}
        >
          {Math.round(rect.x)}%, {Math.round(rect.y)}% · {Math.round(rect.w)}×{Math.round(rect.h)}%
        </div>
      </div>
    </div>
  )
}

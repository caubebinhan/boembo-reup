import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react'
import type Konva from 'konva'
import { Circle, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import type { PluginMeta, VideoEditOperation } from './types'
import { V } from './types'
import {
  applyCanvasRect,
  clampCanvasRect,
  resolveCanvasRect,
  resolveCanvasSpace,
  type CanvasRect,
} from './canvas-contracts'

interface KonvaCanvasSurfaceProps {
  videoWidth: number
  videoHeight: number
  operation: VideoEditOperation | null
  plugin: PluginMeta | null
  operations: VideoEditOperation[]
  onUpdateParams: (opId: string, params: Record<string, unknown>) => void
}

type HandleCorner = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_RADIUS = 6

interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

function toPixelRect(rect: CanvasRect, space: CanvasRect, vw: number, vh: number): PixelRect {
  const sx = (space.x / 100) * vw
  const sy = (space.y / 100) * vh
  const sw = (space.w / 100) * vw
  const sh = (space.h / 100) * vh
  return {
    x: sx + (rect.x / 100) * sw,
    y: sy + (rect.y / 100) * sh,
    w: (rect.w / 100) * sw,
    h: (rect.h / 100) * sh,
  }
}

function toLocalRect(pixelRect: PixelRect, space: CanvasRect, vw: number, vh: number): CanvasRect {
  const sx = (space.x / 100) * vw
  const sy = (space.y / 100) * vh
  const sw = Math.max(1, (space.w / 100) * vw)
  const sh = Math.max(1, (space.h / 100) * vh)
  return {
    x: ((pixelRect.x - sx) / sw) * 100,
    y: ((pixelRect.y - sy) / sh) * 100,
    w: (pixelRect.w / sw) * 100,
    h: (pixelRect.h / sh) * 100,
  }
}

function cornerPosition(pixelRect: PixelRect, corner: HandleCorner): { x: number; y: number } {
  if (corner === 'nw') return { x: pixelRect.x, y: pixelRect.y }
  if (corner === 'ne') return { x: pixelRect.x + pixelRect.w, y: pixelRect.y }
  if (corner === 'sw') return { x: pixelRect.x, y: pixelRect.y + pixelRect.h }
  return { x: pixelRect.x + pixelRect.w, y: pixelRect.y + pixelRect.h }
}

function toAssetSrc(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  if (/^(file|https?|data):/i.test(raw)) return raw

  const normalized = raw.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) return encodeURI(`file:///${normalized}`)
  if (normalized.startsWith('/')) return encodeURI(`file://${normalized}`)
  return encodeURI(`file://${normalized}`)
}

export function KonvaCanvasSurface({
  videoWidth: vw,
  videoHeight: vh,
  operation,
  plugin,
  operations,
  onUpdateParams,
}: KonvaCanvasSurfaceProps): ReactElement | null {
  const hint = plugin?.previewHint || 'none'
  const aspect = vw > 0 && vh > 0 ? (vw / vh) : null
  const rect = operation && plugin ? resolveCanvasRect(operation, plugin, aspect) : null
  const overlayAssetSrc = hint === 'overlay-image' ? toAssetSrc(operation?.params?.image) : null
  const overlayText = hint === 'overlay-text' ? String(operation?.params?.text || '').trim() : ''
  const [overlayImage, setOverlayImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (hint !== 'overlay-image' || !overlayAssetSrc) {
      setOverlayImage(null)
      return
    }
    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (!cancelled) setOverlayImage(img)
    }
    img.onerror = () => {
      if (!cancelled) setOverlayImage(null)
    }
    img.src = overlayAssetSrc
    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [hint, overlayAssetSrc])

  if (!operation || !plugin || vw <= 0 || vh <= 0) return null
  if (hint === 'none' || hint === 'transform') return null
  if (!rect) return null

  const space = resolveCanvasSpace(operation, plugin, operations, aspect)
  const px = toPixelRect(rect, space, vw, vh)
  const sx = (space.x / 100) * vw
  const sy = (space.y / 100) * vh
  const sw = (space.w / 100) * vw
  const sh = (space.h / 100) * vh
  const hasScopedSpace = space.x > 0 || space.y > 0 || space.w < 100 || space.h < 100

  const color = hint === 'crop-guide' ? V.accent : hint === 'blur-region' ? '#3b82f6' : hint === 'overlay-image' ? V.accent : '#e67e22'
  const isRegion = hint === 'crop-guide' || hint === 'blur-region'
  const isDashed = hint === 'overlay-image' || hint === 'overlay-text'

  const commit = (nextRect: CanvasRect): void => {
    const nextParams = applyCanvasRect(operation, plugin, clampCanvasRect(nextRect))
    onUpdateParams(operation.id, nextParams)
  }

  const onMove = (e: Konva.KonvaEventObject<DragEvent>): void => {
    const node = e.target
    const pos = node.position()
    const nextLocal = toLocalRect({ x: pos.x, y: pos.y, w: px.w, h: px.h }, space, vw, vh)
    commit({ x: nextLocal.x, y: nextLocal.y, w: rect.w, h: rect.h })
  }

  const onResize = (corner: HandleCorner) => (e: Konva.KonvaEventObject<DragEvent>): void => {
    const pos = e.target.position()
    const right = rect.x + rect.w
    const bottom = rect.y + rect.h
    const swSafe = Math.max(1, sw)
    const shSafe = Math.max(1, sh)
    const lx = ((pos.x - sx) / swSafe) * 100
    const ly = ((pos.y - sy) / shSafe) * 100
    let next: CanvasRect
    if (corner === 'nw') next = { x: lx, y: ly, w: right - lx, h: bottom - ly }
    else if (corner === 'ne') next = { x: rect.x, y: ly, w: lx - rect.x, h: bottom - ly }
    else if (corner === 'sw') next = { x: lx, y: rect.y, w: right - lx, h: ly - rect.y }
    else next = { x: rect.x, y: rect.y, w: lx - rect.x, h: ly - rect.y }
    commit(next)
  }

  const maskRect = hint === 'crop-guide'
    ? px
    : { x: sx, y: sy, w: sw, h: sh }
  const handles: HandleCorner[] = ['nw', 'ne', 'sw', 'se']

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const step = e.shiftKey ? 5 : 1
    let dx = 0
    let dy = 0
    if (e.key === 'ArrowLeft') dx = -step
    if (e.key === 'ArrowRight') dx = step
    if (e.key === 'ArrowUp') dy = -step
    if (e.key === 'ArrowDown') dy = step
    commit({ x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h })
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ position: 'absolute', inset: 0, outline: 'none', zIndex: 5 }}
      aria-label="Canvas guide overlay. Use arrow keys to nudge position."
    >
      <Stage
        width={vw}
        height={vh}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Layer>
          {(hint === 'crop-guide' || hasScopedSpace) && (
            <>
              <Rect x={0} y={0} width={vw} height={maskRect.y} fill="black" opacity={hint === 'crop-guide' ? 0.35 : 0.22} listening={false} />
              <Rect x={0} y={maskRect.y + maskRect.h} width={vw} height={Math.max(0, vh - (maskRect.y + maskRect.h))} fill="black" opacity={hint === 'crop-guide' ? 0.35 : 0.22} listening={false} />
              <Rect x={0} y={maskRect.y} width={maskRect.x} height={maskRect.h} fill="black" opacity={hint === 'crop-guide' ? 0.35 : 0.22} listening={false} />
              <Rect x={maskRect.x + maskRect.w} y={maskRect.y} width={Math.max(0, vw - (maskRect.x + maskRect.w))} height={maskRect.h} fill="black" opacity={hint === 'crop-guide' ? 0.35 : 0.22} listening={false} />
            </>
          )}

          {hasScopedSpace && hint === 'blur-region' && (
            <Rect
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              stroke="#60a5fa88"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {hint === 'overlay-image' && overlayImage && (
            <KonvaImage
              x={px.x}
              y={px.y}
              width={px.w}
              height={px.h}
              image={overlayImage}
              opacity={0.85}
              listening={false}
            />
          )}

          {hint === 'overlay-image' && !overlayImage && (
            <Text
              x={px.x + 4}
              y={px.y + 4}
              text={overlayAssetSrc ? 'Image loading...' : 'Choose image'}
              fontSize={12}
              fill={color}
              listening={false}
            />
          )}

          {hint === 'overlay-text' && (
            <Text
              x={px.x + 4}
              y={px.y + 4}
              text={overlayText || 'Text watermark'}
              fontSize={Math.max(12, Math.min(24, Math.round(px.h * 0.45)))}
              fill={color}
              listening={false}
            />
          )}

          <Rect
            x={px.x}
            y={px.y}
            width={px.w}
            height={px.h}
            stroke={color}
            strokeWidth={2}
            dash={isDashed ? [7, 6] : undefined}
            fill={isDashed ? `${color}11` : undefined}
            draggable
            onDragMove={onMove}
          />

          {handles.map((corner) => {
            const c = cornerPosition(px, corner)
            return (
              <Circle
                key={corner}
                x={c.x}
                y={c.y}
                radius={HANDLE_RADIUS}
                fill="#fff"
                stroke={color}
                strokeWidth={2}
                draggable
                onDragMove={onResize(corner)}
              />
            )
          })}

          <Text
            x={px.x}
            y={Math.max(0, px.y - 18)}
            text={isRegion
              ? `${Math.round(rect.w)}% x ${Math.round(rect.h)}%`
              : `${Math.round(rect.x)}%, ${Math.round(rect.y)}% | ${Math.round(rect.w)}% x ${Math.round(rect.h)}%`}
            fontSize={10}
            fill="#fff"
            padding={4}
            listening={false}
          />
        </Layer>
      </Stage>
    </div>
  )
}

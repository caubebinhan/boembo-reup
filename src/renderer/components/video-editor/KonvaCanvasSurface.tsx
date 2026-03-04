import { useEffect, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import type Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
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
  plugins: PluginMeta[]
  selectedOpId: string | null
  onSelectOperation: (opId: string) => void
  onUpdateParams: (opId: string, params: Record<string, unknown>) => void
}

type HandleCorner = 'nw' | 'ne' | 'sw' | 'se'

interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

interface VisualEntry {
  operation: VideoEditOperation
  plugin: PluginMeta
  hint: string
  rect: CanvasRect
  space: CanvasRect
  px: PixelRect
  selected: boolean
}

const HANDLE_RADIUS = 6

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
  if (/^[a-zA-Z]:\//.test(normalized)) return encodeURI(`file:///${normalized}`).replace(/#/g, '%23')
  if (normalized.startsWith('/')) return encodeURI(`file://${normalized}`).replace(/#/g, '%23')
  return encodeURI(`file://${normalized}`).replace(/#/g, '%23')
}

function hasScopedSpace(space: CanvasRect): boolean {
  return space.x > 0 || space.y > 0 || space.w < 100 || space.h < 100
}

function resolveGuideColor(hint: string): string {
  if (hint === 'crop-guide') return V.accent
  if (hint === 'blur-region') return '#3b82f6'
  if (hint === 'transform') return '#0ea5e9'
  if (hint === 'overlay-image') return '#7c3aed'
  return '#e67e22'
}

function isOverlayHint(hint: string): boolean {
  return hint === 'overlay-image' || hint === 'overlay-text'
}

export function KonvaCanvasSurface({
  videoWidth: vw,
  videoHeight: vh,
  operation,
  plugin,
  operations,
  plugins,
  selectedOpId,
  onSelectOperation,
  onUpdateParams,
}: KonvaCanvasSurfaceProps): ReactElement | null {
  const aspect = vw > 0 && vh > 0 ? (vw / vh) : null
  const pluginMap = useMemo(() => {
    const map = new Map<string, PluginMeta>()
    for (const p of plugins) map.set(p.id, p)
    if (plugin && !map.has(plugin.id)) map.set(plugin.id, plugin)
    return map
  }, [plugins, plugin])

  const overlayEntries = useMemo(() => {
    if (vw <= 0 || vh <= 0) return [] as VisualEntry[]
    return operations
      .filter((op) => op.enabled)
      .map((op) => {
        const opPlugin = pluginMap.get(op.pluginId)
        if (!opPlugin) return null
        const hint = opPlugin.previewHint || 'none'
        if (!isOverlayHint(hint)) return null
        const rect = resolveCanvasRect(op, opPlugin, aspect)
        if (!rect) return null
        const space = resolveCanvasSpace(op, opPlugin, operations, aspect)
        return {
          operation: op,
          plugin: opPlugin,
          hint,
          rect,
          space,
          px: toPixelRect(rect, space, vw, vh),
          selected: selectedOpId === op.id,
        } as VisualEntry
      })
      .filter(Boolean)
      .sort((a, b) => a!.operation.order - b!.operation.order) as VisualEntry[]
  }, [operations, pluginMap, selectedOpId, vw, vh, aspect])

  const guideEntry = useMemo(() => {
    if (!operation || !plugin || vw <= 0 || vh <= 0) return null
    const hint = plugin.previewHint || 'none'
    if (hint === 'none' || isOverlayHint(hint)) return null
    const rect = resolveCanvasRect(operation, plugin, aspect)
    if (!rect) return null
    const space = resolveCanvasSpace(operation, plugin, operations, aspect)
    return {
      operation,
      plugin,
      hint,
      rect,
      space,
      px: toPixelRect(rect, space, vw, vh),
      selected: true,
    } as VisualEntry
  }, [operation, plugin, operations, vw, vh, aspect])

  const renderEntries = useMemo(
    () => (guideEntry ? [...overlayEntries, guideEntry] : overlayEntries),
    [overlayEntries, guideEntry],
  )

  const [imageMap, setImageMap] = useState<Record<string, { src: string; image: HTMLImageElement | null }>>({})
  const overlayEntryMap = useMemo(() => {
    const map = new Map<string, VisualEntry>()
    for (const entry of overlayEntries) map.set(entry.operation.id, entry)
    return map
  }, [overlayEntries])
  const imageSourcesSignature = useMemo(
    () => overlayEntries
      .filter((entry) => entry.hint === 'overlay-image')
      .map((entry) => `${entry.operation.id}:${toAssetSrc(entry.operation.params.image) || ''}`)
      .join('|'),
    [overlayEntries],
  )

  useEffect(() => {
    const nextSources = new Map<string, string>()
    for (const entry of overlayEntries) {
      if (entry.hint !== 'overlay-image') continue
      const src = toAssetSrc(entry.operation.params.image)
      if (src) nextSources.set(entry.operation.id, src)
    }

    setImageMap((prev) => {
      const keep: Record<string, { src: string; image: HTMLImageElement | null }> = {}
      for (const [opId, src] of nextSources.entries()) {
        if (prev[opId] && prev[opId].src === src) keep[opId] = prev[opId]
      }
      return keep
    })

    let active = true
    for (const [opId, src] of nextSources.entries()) {
      const img = new window.Image()
      img.onload = () => {
        if (!active) return
        setImageMap((prev) => ({ ...prev, [opId]: { src, image: img } }))
        const entry = overlayEntryMap.get(opId)
        if (!entry) return
        if (entry.operation.params.keepAspectRatio === false) return
        const aspect = img.naturalHeight > 0 ? (img.naturalWidth / img.naturalHeight) : NaN
        if (!Number.isFinite(aspect) || aspect <= 0) return
        const rawSize = (entry.operation.params.overlaySize || {}) as { w?: number; h?: number }
        const currentW = Math.max(5, Number(rawSize.w ?? entry.rect.w ?? 20))
        const currentH = Math.max(5, Number(rawSize.h ?? entry.rect.h ?? 20))
        const expectedH = Math.max(5, currentW / aspect)
        const currentAspect = Number(entry.operation.params.imageAspect)
        const aspectChanged = !Number.isFinite(currentAspect) || Math.abs(currentAspect - aspect) > 0.001
        const heightDrift = Math.abs(currentH - expectedH) > 0.5
        if (!aspectChanged && !heightDrift) return
        onUpdateParams(entry.operation.id, {
          ...entry.operation.params,
          imageAspect: aspect,
          overlaySize: { w: currentW, h: expectedH },
        })
      }
      img.onerror = () => {
        if (!active) return
        setImageMap((prev) => ({ ...prev, [opId]: { src, image: null } }))
      }
      img.src = src
    }
    return () => {
      active = false
    }
  }, [imageSourcesSignature, overlayEntries, overlayEntryMap, onUpdateParams])

  if (vw <= 0 || vh <= 0 || renderEntries.length === 0) return null

  const commit = (entry: VisualEntry, nextRect: CanvasRect): void => {
    const nextParams = applyCanvasRect(entry.operation, entry.plugin, clampCanvasRect(nextRect))
    onUpdateParams(entry.operation.id, nextParams)
  }

  const onMove = (entry: VisualEntry) => (e: Konva.KonvaEventObject<DragEvent>): void => {
    const node = e.target
    const pos = node.position()
    const nextLocal = toLocalRect({ x: pos.x, y: pos.y, w: entry.px.w, h: entry.px.h }, entry.space, vw, vh)
    commit(entry, { x: nextLocal.x, y: nextLocal.y, w: entry.rect.w, h: entry.rect.h })
  }

  const onResize = (entry: VisualEntry, corner: HandleCorner) => (e: Konva.KonvaEventObject<DragEvent>): void => {
    const pos = e.target.position()
    const right = entry.rect.x + entry.rect.w
    const bottom = entry.rect.y + entry.rect.h
    const sx = (entry.space.x / 100) * vw
    const sy = (entry.space.y / 100) * vh
    const sw = Math.max(1, (entry.space.w / 100) * vw)
    const sh = Math.max(1, (entry.space.h / 100) * vh)
    const lx = ((pos.x - sx) / sw) * 100
    const ly = ((pos.y - sy) / sh) * 100

    let next: CanvasRect
    if (corner === 'nw') next = { x: lx, y: ly, w: right - lx, h: bottom - ly }
    else if (corner === 'ne') next = { x: entry.rect.x, y: ly, w: lx - entry.rect.x, h: bottom - ly }
    else if (corner === 'sw') next = { x: lx, y: entry.rect.y, w: right - lx, h: ly - entry.rect.y }
    else next = { x: entry.rect.x, y: entry.rect.y, w: lx - entry.rect.x, h: ly - entry.rect.y }

    if (entry.hint === 'overlay-image' && entry.operation.params.keepAspectRatio !== false) {
      const loaded = imageMap[entry.operation.id]?.image || null
      const imageAspect = loaded && loaded.naturalHeight > 0
        ? (loaded.naturalWidth / loaded.naturalHeight)
        : Number(entry.operation.params.imageAspect)
      const fallbackAspect = entry.rect.h > 0 ? (entry.rect.w / entry.rect.h) : 1
      const aspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : fallbackAspect
      const widthDelta = Math.abs(next.w - entry.rect.w)
      const heightDelta = Math.abs(next.h - entry.rect.h)
      let nextW = Math.max(5, next.w)
      let nextH = Math.max(5, next.h)
      if (widthDelta >= heightDelta) nextH = nextW / Math.max(0.01, aspect)
      else nextW = nextH * Math.max(0.01, aspect)
      next = {
        x: corner === 'nw' || corner === 'sw' ? (right - nextW) : entry.rect.x,
        y: corner === 'nw' || corner === 'ne' ? (bottom - nextH) : entry.rect.y,
        w: nextW,
        h: nextH,
      }
    }

    commit(entry, next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    const selected = renderEntries.find((entry) => entry.selected)
    if (!selected) return
    e.preventDefault()
    const step = e.shiftKey ? 5 : 1
    let dx = 0
    let dy = 0
    if (e.key === 'ArrowLeft') dx = -step
    if (e.key === 'ArrowRight') dx = step
    if (e.key === 'ArrowUp') dy = -step
    if (e.key === 'ArrowDown') dy = step
    commit(selected, {
      x: selected.rect.x + dx,
      y: selected.rect.y + dy,
      w: selected.rect.w,
      h: selected.rect.h,
    })
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ position: 'absolute', inset: 0, outline: 'none', zIndex: 5 }}
      aria-label="Canvas overlay controls. Select layer then drag/resize."
    >
      <Stage width={vw} height={vh} style={{ position: 'absolute', inset: 0 }}>
        <Layer>
          {renderEntries.map((entry) => {
            const color = resolveGuideColor(entry.hint)
            const scoped = hasScopedSpace(entry.space)
            const sx = (entry.space.x / 100) * vw
            const sy = (entry.space.y / 100) * vh
            const sw = (entry.space.w / 100) * vw
            const sh = (entry.space.h / 100) * vh
            const showMask = entry.selected && (entry.hint === 'crop-guide' || (entry.hint === 'blur-region' && scoped))

            return (
              <Group key={entry.operation.id}>
                {showMask && (
                  <>
                    <Rect x={0} y={0} width={vw} height={entry.px.y} fill="black" opacity={0.32} listening={false} />
                    <Rect x={0} y={entry.px.y + entry.px.h} width={vw} height={Math.max(0, vh - (entry.px.y + entry.px.h))} fill="black" opacity={0.32} listening={false} />
                    <Rect x={0} y={entry.px.y} width={entry.px.x} height={entry.px.h} fill="black" opacity={0.32} listening={false} />
                    <Rect x={entry.px.x + entry.px.w} y={entry.px.y} width={Math.max(0, vw - (entry.px.x + entry.px.w))} height={entry.px.h} fill="black" opacity={0.32} listening={false} />
                  </>
                )}

                {entry.selected && scoped && entry.hint === 'blur-region' && (
                  <Rect x={sx} y={sy} width={sw} height={sh} stroke="#60a5fa88" strokeWidth={1} dash={[4, 4]} listening={false} />
                )}

                {entry.hint === 'overlay-image' && (() => {
                  const loaded = imageMap[entry.operation.id]?.image || null
                  const opacity = Math.max(0.05, Math.min(1, Number(entry.operation.params.opacity ?? 0.85)))
                  const rotation = Number(entry.operation.params.rotation ?? 0)
                  if (loaded) {
                    return (
                      <KonvaImage
                        x={entry.px.x + (entry.px.w / 2)}
                        y={entry.px.y + (entry.px.h / 2)}
                        width={entry.px.w}
                        height={entry.px.h}
                        offsetX={entry.px.w / 2}
                        offsetY={entry.px.h / 2}
                        rotation={rotation}
                        image={loaded}
                        opacity={opacity}
                        listening={false}
                      />
                    )
                  }
                  return (
                    <Text
                      x={entry.px.x + 4}
                      y={entry.px.y + 4}
                      text={toAssetSrc(entry.operation.params.image) ? 'Image loading...' : 'Choose image'}
                      fontSize={12}
                      fill={color}
                      listening={false}
                    />
                  )
                })()}

                {entry.hint === 'overlay-text' && (
                  <Text
                    x={entry.px.x + 4}
                    y={entry.px.y + 4}
                    text={String(entry.operation.params.text || 'Text watermark')}
                    fontSize={Math.max(10, Number(entry.operation.params.fontSize || 24))}
                    fontFamily={String(entry.operation.params.fontFamily || 'Arial')}
                    fill={String(entry.operation.params.fontColor || '#ffffff')}
                    shadowColor={entry.operation.params.outline === false ? undefined : 'black'}
                    shadowBlur={entry.operation.params.outline === false ? 0 : 2}
                    shadowOffsetX={entry.operation.params.outline === false ? 0 : 1}
                    shadowOffsetY={entry.operation.params.outline === false ? 0 : 1}
                    listening={false}
                  />
                )}

                <Rect
                  x={entry.px.x}
                  y={entry.px.y}
                  width={entry.px.w}
                  height={entry.px.h}
                  stroke={color}
                  strokeWidth={entry.selected ? 2 : 1}
                  dash={isOverlayHint(entry.hint) ? [7, 6] : undefined}
                  fill={isOverlayHint(entry.hint) ? `${color}${entry.selected ? '1f' : '11'}` : undefined}
                  draggable
                  onDragMove={onMove(entry)}
                  onClick={() => onSelectOperation(entry.operation.id)}
                  onTap={() => onSelectOperation(entry.operation.id)}
                />

                {entry.selected && (['nw', 'ne', 'sw', 'se'] as HandleCorner[]).map((corner) => {
                  const c = cornerPosition(entry.px, corner)
                  return (
                    <Circle
                      key={`${entry.operation.id}_${corner}`}
                      x={c.x}
                      y={c.y}
                      radius={HANDLE_RADIUS}
                      fill="#fff"
                      stroke={color}
                      strokeWidth={2}
                      draggable
                      onDragMove={onResize(entry, corner)}
                    />
                  )
                })}

                <Text
                  x={entry.px.x}
                  y={Math.max(0, entry.px.y - 18)}
                  text={`${entry.plugin.name} • ${Math.round(entry.rect.w)}% x ${Math.round(entry.rect.h)}%`}
                  fontSize={10}
                  fill="#fff"
                  padding={4}
                  listening={false}
                />
              </Group>
            )
          })}
        </Layer>
      </Stage>
    </div>
  )
}

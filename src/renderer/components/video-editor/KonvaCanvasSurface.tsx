import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import type Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import type { PluginMeta, VideoEditOperation } from './types'
import { V } from './types'
import {
  applyCanvasRect,
  clampCanvasRect,
  resolveCanvasRect,
  resolveCanvasSpace,
  resolveTimelineCropSpace,
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

interface TextEditState {
  opId: string
  value: string
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
  if (hint === 'transform') return '#67e8f9'
  if (hint === 'overlay-image') return '#84cc16'
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
  const timelineCropSpace = useMemo(
    () => resolveTimelineCropSpace(operations, aspect),
    [operations, aspect],
  )
  const timelineCropPx = useMemo(() => {
    if (!timelineCropSpace || !hasScopedSpace(timelineCropSpace)) return null
    return toPixelRect(timelineCropSpace, { x: 0, y: 0, w: 100, h: 100 }, vw, vh)
  }, [timelineCropSpace, vw, vh])

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
  const useCropViewport = Boolean(timelineCropPx)
  const viewport = useMemo<PixelRect>(() => {
    if (!useCropViewport || !timelineCropPx) return { x: 0, y: 0, w: vw, h: vh }
    return {
      x: timelineCropPx.x,
      y: timelineCropPx.y,
      w: Math.max(1, timelineCropPx.w),
      h: Math.max(1, timelineCropPx.h),
    }
  }, [useCropViewport, timelineCropPx, vw, vh])

  const [imageMap, setImageMap] = useState<Record<string, { src: string; image: HTMLImageElement | null }>>({})
  const [textEditor, setTextEditor] = useState<TextEditState | null>(null)
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

  const editingEntry = useMemo(
    () => (textEditor ? overlayEntryMap.get(textEditor.opId) || null : null),
    [overlayEntryMap, textEditor],
  )

  const commit = (entry: VisualEntry, nextRect: CanvasRect): void => {
    const nextParams = applyCanvasRect(entry.operation, entry.plugin, clampCanvasRect(nextRect))
    onUpdateParams(entry.operation.id, nextParams)
  }

  const toViewportRect = useCallback((px: PixelRect): PixelRect => ({
    x: ((px.x - viewport.x) / viewport.w) * vw,
    y: ((px.y - viewport.y) / viewport.h) * vh,
    w: (px.w / viewport.w) * vw,
    h: (px.h / viewport.h) * vh,
  }), [viewport, vw, vh])

  const fromViewportPoint = useCallback((x: number, y: number): { x: number; y: number } => ({
    x: viewport.x + (x / Math.max(1, vw)) * viewport.w,
    y: viewport.y + (y / Math.max(1, vh)) * viewport.h,
  }), [viewport, vw, vh])

  const onMove = (entry: VisualEntry) => (e: Konva.KonvaEventObject<DragEvent>): void => {
    const node = e.target
    const pos = node.position()
    const topLeft = fromViewportPoint(pos.x, pos.y)
    const nextRectGlobal: PixelRect = {
      x: topLeft.x,
      y: topLeft.y,
      w: (entry.px.w / Math.max(1, vw)) * viewport.w,
      h: (entry.px.h / Math.max(1, vh)) * viewport.h,
    }
    const nextLocal = toLocalRect(nextRectGlobal, entry.space, vw, vh)
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
    const globalPos = fromViewportPoint(pos.x, pos.y)
    const lx = ((globalPos.x - sx) / sw) * 100
    const ly = ((globalPos.y - sy) / sh) * 100

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

  const beginTextEdit = useCallback((entry: VisualEntry): void => {
    if (entry.hint !== 'overlay-text') return
    setTextEditor({
      opId: entry.operation.id,
      value: String(entry.operation.params.text || ''),
    })
    onSelectOperation(entry.operation.id)
  }, [onSelectOperation])

  const commitTextEdit = useCallback((): void => {
    if (!textEditor) return
    const entry = overlayEntryMap.get(textEditor.opId)
    if (!entry) {
      setTextEditor(null)
      return
    }
    onUpdateParams(entry.operation.id, {
      ...entry.operation.params,
      text: textEditor.value,
    })
    setTextEditor(null)
  }, [textEditor, overlayEntryMap, onUpdateParams])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (textEditor && editingEntry) return
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

  const editingViewportRect = editingEntry ? toViewportRect(editingEntry.px) : null

  if (vw <= 0 || vh <= 0 || renderEntries.length === 0) return null

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ position: 'absolute', inset: 0, outline: 'none', zIndex: 5 }}
      aria-label="Canvas overlay controls. Select layer then drag/resize."
    >
      <Stage width={vw} height={vh} style={{ position: 'absolute', inset: 0 }}>
        <Layer>
          {useCropViewport && (
            <Text
              x={8}
              y={8}
              text="Crop viewport active"
              fontSize={10}
              fill="#bfdbfe"
              listening={false}
            />
          )}

          {renderEntries.map((entry) => {
            const color = resolveGuideColor(entry.hint)
            const scoped = hasScopedSpace(entry.space)
            const sx = (entry.space.x / 100) * vw
            const sy = (entry.space.y / 100) * vh
            const sw = (entry.space.w / 100) * vw
            const sh = (entry.space.h / 100) * vh
            const px = toViewportRect(entry.px)
            const scopedPx = toViewportRect({ x: sx, y: sy, w: sw, h: sh })
            const showMask = entry.selected && (
              entry.hint === 'crop-guide'
              || (entry.hint === 'blur-region' && scoped)
              || (entry.hint === 'transform' && (
                entry.rect.x > 0.5
                || entry.rect.y > 0.5
                || entry.rect.w < 99.5
                || entry.rect.h < 99.5
              ))
            )
            const maskOpacity = entry.hint === 'transform' ? 0.2 : 0.32
            const shouldTint = isOverlayHint(entry.hint) || entry.hint === 'transform'

            return (
              <Group key={entry.operation.id}>
                {showMask && (
                  <>
                    <Rect x={0} y={0} width={vw} height={px.y} fill="black" opacity={maskOpacity} listening={false} />
                    <Rect x={0} y={px.y + px.h} width={vw} height={Math.max(0, vh - (px.y + px.h))} fill="black" opacity={maskOpacity} listening={false} />
                    <Rect x={0} y={px.y} width={px.x} height={px.h} fill="black" opacity={maskOpacity} listening={false} />
                    <Rect x={px.x + px.w} y={px.y} width={Math.max(0, vw - (px.x + px.w))} height={px.h} fill="black" opacity={maskOpacity} listening={false} />
                  </>
                )}

                {entry.selected && scoped && entry.hint === 'blur-region' && (
                  <Rect x={scopedPx.x} y={scopedPx.y} width={scopedPx.w} height={scopedPx.h} stroke="#60a5fa88" strokeWidth={1} dash={[4, 4]} listening={false} />
                )}

                {entry.hint === 'overlay-image' && (() => {
                  const loaded = imageMap[entry.operation.id]?.image || null
                  const opacity = Math.max(0.05, Math.min(1, Number(entry.operation.params.opacity ?? 0.85)))
                  const rotation = Number(entry.operation.params.rotation ?? 0)
                  if (loaded) {
                    return (
                      <KonvaImage
                        x={px.x + (px.w / 2)}
                        y={px.y + (px.h / 2)}
                        width={px.w}
                        height={px.h}
                        offsetX={px.w / 2}
                        offsetY={px.h / 2}
                        rotation={rotation}
                        image={loaded}
                        opacity={opacity}
                        listening={false}
                      />
                    )
                  }
                  return (
                    <Text
                      x={px.x + 4}
                      y={px.y + 4}
                      text={toAssetSrc(entry.operation.params.image) ? 'Image loading...' : 'Choose image'}
                      fontSize={12}
                      fill={color}
                      listening={false}
                    />
                  )
                })()}

                {entry.hint === 'overlay-text' && (
                  <Text
                    x={px.x + 4}
                    y={px.y + 4}
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
                  x={px.x}
                  y={px.y}
                  width={px.w}
                  height={px.h}
                  stroke={color}
                  strokeWidth={entry.selected ? 2 : 1}
                  dash={isOverlayHint(entry.hint) ? [7, 6] : undefined}
                  fill={shouldTint ? `${color}${entry.selected ? '1f' : '11'}` : undefined}
                  draggable
                  onDragMove={onMove(entry)}
                  onClick={() => onSelectOperation(entry.operation.id)}
                  onTap={() => onSelectOperation(entry.operation.id)}
                  onDblClick={() => beginTextEdit(entry)}
                  onDblTap={() => beginTextEdit(entry)}
                />

                {entry.selected && (['nw', 'ne', 'sw', 'se'] as HandleCorner[]).map((corner) => {
                  const c = cornerPosition(px, corner)
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
                  x={px.x}
                  y={Math.max(0, px.y - 18)}
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
      {editingEntry && editingViewportRect && textEditor && (
        <textarea
          autoFocus
          value={textEditor.value}
          onChange={(e) => setTextEditor((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          onBlur={commitTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setTextEditor(null)
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commitTextEdit()
            }
            e.stopPropagation()
          }}
          style={{
            position: 'absolute',
            left: Math.max(0, editingViewportRect.x + 2),
            top: Math.max(0, editingViewportRect.y + 2),
            width: Math.max(120, editingViewportRect.w - 4),
            height: Math.max(32, editingViewportRect.h - 4),
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #38bdf8',
            background: '#0f172acc',
            color: '#f8fafc',
            fontSize: Math.max(10, Number(editingEntry.operation.params.fontSize || 24)),
            outline: 'none',
            resize: 'none',
            zIndex: 6,
          }}
          aria-label="Edit watermark text"
        />
      )}
    </div>
  )
}

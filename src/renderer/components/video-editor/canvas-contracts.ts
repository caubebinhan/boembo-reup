import type { PluginMeta, VideoEditOperation } from './types'

export interface CanvasRect {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasNumericField {
  key: keyof CanvasRect
  label: string
  value: number
  min: number
  max: number
  step: number
}

const FULL_CANVAS_RECT: CanvasRect = { x: 0, y: 0, w: 100, h: 100 }

const OVERLAY_POS_PRESETS: Record<string, { x: number; y: number }> = {
  'top-left': { x: 5, y: 5 },
  'top-center': { x: 40, y: 5 },
  'top-right': { x: 75, y: 5 },
  'center-left': { x: 5, y: 40 },
  center: { x: 40, y: 40 },
  'center-right': { x: 75, y: 40 },
  'bottom-left': { x: 5, y: 75 },
  'bottom-center': { x: 40, y: 75 },
  'bottom-right': { x: 75, y: 75 },
}

const DEFAULT_REGION_RECT: CanvasRect = { x: 10, y: 10, w: 80, h: 80 }
const DEFAULT_OVERLAY_RECT: CanvasRect = { x: 40, y: 40, w: 20, h: 20 }

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function clampCanvasRect(rect: CanvasRect): CanvasRect {
  const w = Math.max(5, Math.min(100, asNumber(rect.w, 20)))
  const h = Math.max(5, Math.min(100, asNumber(rect.h, 20)))
  const x = Math.max(0, Math.min(100 - w, asNumber(rect.x, 0)))
  const y = Math.max(0, Math.min(100 - h, asNumber(rect.y, 0)))
  return { x, y, w, h }
}

function normalizeObjectRect(value: unknown, fallback: CanvasRect): CanvasRect {
  const v = (value || {}) as Partial<CanvasRect>
  return clampCanvasRect({
    x: asNumber(v.x, fallback.x),
    y: asNumber(v.y, fallback.y),
    w: asNumber(v.w, fallback.w),
    h: asNumber(v.h, fallback.h),
  })
}

export function resolveCanvasRect(operation: VideoEditOperation, plugin: PluginMeta): CanvasRect | null {
  const hint = plugin.previewHint || 'none'

  if (hint === 'crop-guide') {
    const region = operation.params.cropRegion
    if (region) return normalizeObjectRect(region, DEFAULT_REGION_RECT)
    const fallback = {
      x: asNumber(operation.params.x, DEFAULT_REGION_RECT.x),
      y: asNumber(operation.params.y, DEFAULT_REGION_RECT.y),
      w: asNumber(operation.params.w, DEFAULT_REGION_RECT.w),
      h: asNumber(operation.params.h, DEFAULT_REGION_RECT.h),
    }
    return clampCanvasRect(fallback)
  }

  if (hint === 'blur-region') {
    return normalizeObjectRect(operation.params.region, DEFAULT_REGION_RECT)
  }

  if (hint === 'overlay-image' || hint === 'overlay-text') {
    const rawPos = operation.params.position
    const resolvedPos = typeof rawPos === 'string'
      ? (OVERLAY_POS_PRESETS[rawPos] || OVERLAY_POS_PRESETS.center)
      : {
        x: asNumber((rawPos as { x?: number })?.x, DEFAULT_OVERLAY_RECT.x),
        y: asNumber((rawPos as { y?: number })?.y, DEFAULT_OVERLAY_RECT.y),
      }

    const rawSize = operation.params.overlaySize
    const defaultSize = hint === 'overlay-image'
      ? asNumber(operation.params.size, DEFAULT_OVERLAY_RECT.w)
      : DEFAULT_OVERLAY_RECT.w
    const resolvedSize = rawSize
      ? {
        w: asNumber((rawSize as { w?: number })?.w, defaultSize),
        h: asNumber((rawSize as { h?: number })?.h, defaultSize),
      }
      : { w: defaultSize, h: defaultSize }

    return clampCanvasRect({
      x: resolvedPos.x,
      y: resolvedPos.y,
      w: resolvedSize.w,
      h: resolvedSize.h,
    })
  }

  return null
}

function parseAspectRatio(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const [wRaw, hRaw] = value.split(':')
  const w = Number(wRaw)
  const h = Number(hRaw)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return w / h
}

function resolveCropRect(operation: VideoEditOperation, sourceAspect: number | null): CanvasRect | null {
  if (operation.pluginId !== 'builtin.crop') return null
  const mode = String(operation.params.mode || 'aspect')
  if (mode === 'manual') {
    if (operation.params.cropRegion) {
      return normalizeObjectRect(operation.params.cropRegion, DEFAULT_REGION_RECT)
    }
    const hasLegacyManualFields = ['x', 'y', 'w', 'h'].every((k) => typeof operation.params[k] === 'number')
    if (!hasLegacyManualFields) return null
    return clampCanvasRect({
      x: asNumber(operation.params.x, DEFAULT_REGION_RECT.x),
      y: asNumber(operation.params.y, DEFAULT_REGION_RECT.y),
      w: asNumber(operation.params.w, DEFAULT_REGION_RECT.w),
      h: asNumber(operation.params.h, DEFAULT_REGION_RECT.h),
    })
  }

  const targetAspect = parseAspectRatio(operation.params.aspectRatio) || (9 / 16)
  const currentAspect = sourceAspect && sourceAspect > 0 ? sourceAspect : targetAspect
  if (!Number.isFinite(currentAspect) || currentAspect <= 0) return null

  // Mirror crop plugin behavior for aspect mode: center-x always, y follows top/center/bottom when cropping height.
  if (currentAspect > targetAspect) {
    const w = Math.max(5, Math.min(100, (targetAspect / currentAspect) * 100))
    return clampCanvasRect({ x: (100 - w) / 2, y: 0, w, h: 100 })
  }

  const h = Math.max(5, Math.min(100, (currentAspect / targetAspect) * 100))
  const pos = String(operation.params.position || 'center')
  const y = pos === 'top' ? 0 : pos === 'bottom' ? (100 - h) : ((100 - h) / 2)
  return clampCanvasRect({ x: 0, y, w: 100, h })
}

export function resolveCanvasSpace(
  operation: VideoEditOperation,
  plugin: PluginMeta,
  operations: VideoEditOperation[],
  sourceAspect?: number | null,
): CanvasRect {
  const hint = plugin.previewHint || 'none'
  if (hint !== 'blur-region') return FULL_CANVAS_RECT
  const normalizedAspect = sourceAspect && Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : null
  const priorCrop = [...operations]
    .filter((op) => op.enabled && op.order < operation.order && op.id !== operation.id && op.pluginId === 'builtin.crop')
    .sort((a, b) => b.order - a.order)
    .map((op) => resolveCropRect(op, normalizedAspect))
    .find(Boolean)
  return priorCrop || FULL_CANVAS_RECT
}

export function applyCanvasRect(
  operation: VideoEditOperation,
  plugin: PluginMeta,
  nextRect: CanvasRect,
): Record<string, unknown> {
  const hint = plugin.previewHint || 'none'
  const rect = clampCanvasRect(nextRect)

  if (hint === 'crop-guide') {
    return {
      ...operation.params,
      mode: 'manual',
      cropRegion: rect,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.w),
      h: Math.round(rect.h),
    }
  }

  if (hint === 'blur-region') {
    return {
      ...operation.params,
      region: rect,
    }
  }

  if (hint === 'overlay-image') {
    return {
      ...operation.params,
      position: { x: rect.x, y: rect.y },
      overlaySize: { w: rect.w, h: rect.h },
      size: Math.round(rect.w),
    }
  }

  if (hint === 'overlay-text') {
    return {
      ...operation.params,
      position: { x: rect.x, y: rect.y },
      overlaySize: { w: rect.w, h: rect.h },
      fontSize: Math.max(10, Math.round(rect.h * 1.2)),
    }
  }

  return operation.params
}

export function getCanvasNumericFields(operation: VideoEditOperation, plugin: PluginMeta): CanvasNumericField[] | null {
  const rect = resolveCanvasRect(operation, plugin)
  if (!rect) return null
  return [
    { key: 'x', label: 'X', value: rect.x, min: 0, max: 100, step: 1 },
    { key: 'y', label: 'Y', value: rect.y, min: 0, max: 100, step: 1 },
    { key: 'w', label: 'W', value: rect.w, min: 5, max: 100, step: 1 },
    { key: 'h', label: 'H', value: rect.h, min: 5, max: 100, step: 1 },
  ]
}

export function updateCanvasNumericField(
  operation: VideoEditOperation,
  plugin: PluginMeta,
  field: keyof CanvasRect,
  value: number,
): Record<string, unknown> | null {
  const rect = resolveCanvasRect(operation, plugin)
  if (!rect) return null
  const next = { ...rect, [field]: value }
  return applyCanvasRect(operation, plugin, next)
}

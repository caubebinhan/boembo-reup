/**
 * Plugin: Image Watermark
 * Overlay an image (logo/watermark) on the video.
 * Supports: position picker, time range, opacity, size, padding.
 * Multi-instance: user can add multiple watermarks at different positions/times.
 */
import type { VideoEditPlugin, VideoFilter } from '@core/video-edit/types'

const watermarkImage: VideoEditPlugin = {
  id: 'builtin.watermark_image',
  name: 'Image Watermark',
  group: 'overlay',
  icon: 'image',
  description: 'Add image watermark / logo overlay',
  allowMultipleInstances: true,
  addInstanceLabel: 'Add another watermark',
  previewHint: 'overlay-image',

  configSchema: [
    {
      key: 'image',
      type: 'asset',
      label: 'Watermark image',
      description: 'PNG recommended (with transparency)',
      required: true,
    },
    {
      key: 'position',
      type: 'position',
      label: 'Position',
      default: 'bottom-right',
      description: 'Drag to place or choose preset position',
    },
    {
      key: 'size',
      type: 'slider',
      label: 'Size',
      default: 15,
      min: 5,
      max: 50,
      step: 1,
      unit: '% of width',
      description: 'Watermark width as percentage of video width',
    },
    {
      key: 'opacity',
      type: 'slider',
      label: 'Opacity',
      default: 0.8,
      min: 0.1,
      max: 1.0,
      step: 0.05,
    },
    {
      key: 'rotation',
      type: 'slider',
      label: 'Rotation',
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      unit: 'deg',
    },
    {
      key: 'keepAspectRatio',
      type: 'boolean',
      label: 'Lock aspect ratio',
      default: true,
      description: 'Keep original image proportions while resizing on canvas',
    },
    {
      key: 'padding',
      type: 'slider',
      label: 'Padding from edge',
      default: 20,
      min: 0,
      max: 100,
      step: 5,
      unit: 'px',
    },
    {
      key: 'timeRange',
      type: 'timeRange',
      label: 'Visible during',
      description: 'Leave empty for entire video',
    },
    {
      key: 'timeJitterSec',
      type: 'slider',
      label: 'Random time jitter',
      default: 0,
      min: 0,
      max: 10,
      step: 0.1,
      unit: 's',
      description: 'Randomly shifts start/end time on each render',
    },
  ],

  getAdditionalInputs(params, ctx) {
    const imagePath = ctx.assetResolver(params.image)
    return imagePath ? [imagePath] : []
  },

  buildFilters(params, ctx) {
    if (!params.image) return []

    const inputIdx = ctx.additionalInputStartIndex ?? ctx.nextInputIndex()
    const key = ctx.instanceKey
    const rawOverlaySize = params.overlaySize as { w?: number; h?: number } | undefined
    const sizePercentW = Math.max(1, Math.min(100, Number(rawOverlaySize?.w ?? params.size ?? 15))) / 100
    const sizePercentH = Math.max(1, Math.min(100, Number(rawOverlaySize?.h ?? rawOverlaySize?.w ?? params.size ?? 15))) / 100
    const keepAspectRatio = params.keepAspectRatio !== false
    const opacity = params.opacity ?? 0.8
    const rotation = Number(params.rotation ?? 0)
    const padding = params.padding ?? 20

    const filters: VideoFilter[] = []

    // Scale watermark relative to current main stream size
    filters.push({
      filter: 'scale2ref',
      options: {
        w: `main_w*${sizePercentW}`,
        h: keepAspectRatio ? -1 : `main_h*${sizePercentH}`,
      },
      inputs: [`${inputIdx}:v`, '0:v'],
      outputs: [`wm_${key}`, `base_${key}`],
    })

    // Apply opacity if needed
    let wmLabel = `wm_${key}`
    if (opacity < 1.0) {
      filters.push({
        filter: 'colorchannelmixer',
        options: { aa: opacity },
        inputs: [wmLabel],
        outputs: [`wm_alpha_${key}`],
      })
      wmLabel = `wm_alpha_${key}`
    }

    if (Math.abs(rotation) > 0.001) {
      filters.push({
        filter: 'rotate',
        options: {
          a: `${rotation}*PI/180`,
          c: 'none',
          ow: 'rotw(iw)',
          oh: 'roth(ih)',
        },
        inputs: [wmLabel],
        outputs: [`wm_rot_${key}`],
      })
      wmLabel = `wm_rot_${key}`
    }

    // Calculate overlay position
    const { x, y } = resolvePosition(params.position, padding)

    // Build overlay with optional time range
    const overlayOpts: Record<string, any> = { x, y }
    const start = params.timeRange?.start
    const end = params.timeRange?.end
    const jitter = Math.max(0, Number(params.timeJitterSec ?? 0))
    if (start != null || end != null || jitter > 0) {
      const s = clampTime((start ?? 0) + randomJitter(jitter), 0, ctx.inputDurationSec)
      const e = clampTime((end ?? ctx.inputDurationSec) + randomJitter(jitter), s + 0.05, ctx.inputDurationSec)
      overlayOpts.enable = `between(t,${s},${e})`
    }

    filters.push({
      filter: 'overlay',
      options: overlayOpts,
      inputs: [`base_${key}`, wmLabel],
      outputs: [`out_${key}`],
    })

    return filters
  },

  validate(params) {
    if (!params.image) return 'Watermark image is required'
    return null
  },
}

function randomJitter(maxSeconds: number): number {
  if (maxSeconds <= 0) return 0
  return (Math.random() * 2 - 1) * maxSeconds
}

function clampTime(value: number, min: number, max: number): number {
  const v = Number.isFinite(value) ? value : min
  if (max <= min) return max
  return Math.max(min, Math.min(max, v))
}

// -- Shared position resolver --

/** Position preset names -> overlay coordinates */
function resolvePosition(
  position: string | { x: number; y: number },
  padding: number,
): { x: string | number; y: string | number } {
  // Custom x/y from drag
  if (typeof position === 'object' && position.x != null) {
    // Canvas sends % values; convert to current stream expressions.
    return {
      x: `W*${position.x}/100`,
      y: `H*${position.y}/100`,
    }
  }

  const p = String(position || 'bottom-right')
  const POSITIONS: Record<string, { x: string; y: string }> = {
    'top-left':      { x: `${padding}`, y: `${padding}` },
    'top-center':    { x: '(W-w)/2', y: `${padding}` },
    'top-right':     { x: `W-w-${padding}`, y: `${padding}` },
    'center-left':   { x: `${padding}`, y: '(H-h)/2' },
    'center':        { x: '(W-w)/2', y: '(H-h)/2' },
    'center-right':  { x: `W-w-${padding}`, y: '(H-h)/2' },
    'bottom-left':   { x: `${padding}`, y: `H-h-${padding}` },
    'bottom-center': { x: '(W-w)/2', y: `H-h-${padding}` },
    'bottom-right':  { x: `W-w-${padding}`, y: `H-h-${padding}` },
  }

  return POSITIONS[p] || POSITIONS['bottom-right']
}

export { resolvePosition }
export default watermarkImage

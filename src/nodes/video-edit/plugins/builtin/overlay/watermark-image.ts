/**
 * Plugin: Image Watermark
 * ───────────────────────
 * Overlay an image (logo/watermark) on the video.
 * Supports: position picker, time range, opacity, size, padding.
 * Multi-instance: user can add multiple watermarks at different positions/times.
 */
import type { VideoEditPlugin, FFmpegFilter, PluginContext } from '@core/video-edit/types'

const watermarkImage: VideoEditPlugin = {
  id: 'builtin.watermark_image',
  name: 'Image Watermark',
  group: 'overlay',
  icon: '🏷️',
  description: 'Add image watermark / logo overlay',
  allowMultipleInstances: true,
  addInstanceLabel: 'Add another watermark',

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
  ],

  getAdditionalInputs(params, ctx) {
    const imagePath = ctx.assetResolver(params.image)
    return imagePath ? [imagePath] : []
  },

  buildFilters(params, ctx) {
    if (!params.image) return []

    const inputIdx = ctx.nextInputIndex() - 1 // already registered via getAdditionalInputs
    const key = ctx.instanceKey
    const sizePercent = (params.size ?? 15) / 100
    const targetW = Math.round(ctx.inputWidth * sizePercent)
    const opacity = params.opacity ?? 0.8
    const padding = params.padding ?? 20

    const filters: FFmpegFilter[] = []

    // Scale watermark to target size
    filters.push({
      filter: 'scale',
      options: { w: targetW, h: -1 },
      inputs: [`${inputIdx}:v`],
      outputs: [`wm_${key}`],
    })

    // Apply opacity if needed
    if (opacity < 1.0) {
      filters.push({
        filter: 'colorchannelmixer',
        options: { aa: opacity },
        inputs: [`wm_${key}`],
        outputs: [`wm_alpha_${key}`],
      })
    }
    const wmLabel = opacity < 1.0 ? `wm_alpha_${key}` : `wm_${key}`

    // Calculate overlay position
    const { x, y } = resolvePosition(params.position, ctx.inputWidth, ctx.inputHeight, targetW, 0, padding)

    // Build overlay with optional time range
    const overlayOpts: Record<string, any> = { x, y }
    const start = params.timeRange?.start
    const end = params.timeRange?.end
    if (start != null || end != null) {
      const s = start ?? 0
      const e = end ?? ctx.inputDurationSec
      overlayOpts.enable = `between(t,${s},${e})`
    }

    filters.push({
      filter: 'overlay',
      options: overlayOpts,
      inputs: ['0:v', wmLabel],
      outputs: [`out_${key}`],
    })

    return filters
  },

  validate(params) {
    if (!params.image) return 'Watermark image is required'
    return null
  },
}

// ── Shared position resolver ─────────────────────────

/** Position preset names → overlay coordinates */
function resolvePosition(
  position: string | { x: number; y: number },
  videoW: number,
  videoH: number,
  overlayW: number,
  overlayH: number,
  padding: number,
): { x: string | number; y: string | number } {
  // Custom x/y from drag
  if (typeof position === 'object' && position.x != null) {
    return { x: position.x, y: position.y }
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

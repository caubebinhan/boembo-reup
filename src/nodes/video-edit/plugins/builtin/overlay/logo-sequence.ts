/**
 * Plugin: Logo at Timestamps
 * ──────────────────────────
 * Display an image at multiple specific time ranges with different positions.
 * Think: a logo that appears at different corners at different times.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const logoSequence: VideoEditPlugin = {
  id: 'builtin.logo_sequence',
  name: 'Logo Sequence',
  group: 'overlay',
  icon: '🎞️',
  description: 'Show image at specific timestamps with different positions',
  allowMultipleInstances: false,

  configSchema: [
    {
      key: 'image',
      type: 'asset',
      label: 'Logo image',
      required: true,
    },
    {
      key: 'size',
      type: 'slider',
      label: 'Logo size',
      default: 10,
      min: 3,
      max: 40,
      step: 1,
      unit: '% of width',
    },
    {
      key: 'opacity',
      type: 'slider',
      label: 'Opacity',
      default: 0.9,
      min: 0.1,
      max: 1.0,
      step: 0.05,
    },
    {
      key: 'appearances',
      type: 'string',
      label: 'Appearances',
      isArray: true,
      arrayFields: [
        { key: 'startTime', type: 'time', label: 'Start', default: 0 },
        { key: 'endTime', type: 'time', label: 'End', default: 3 },
        { key: 'position', type: 'position', label: 'Position', default: 'top-right' },
      ],
      description: 'Add time ranges + positions for logo appearances',
    },
  ],

  getAdditionalInputs(params, ctx) {
    const imagePath = ctx.assetResolver(params.image)
    return imagePath ? [imagePath] : []
  },

  buildFilters(params, ctx) {
    if (!params.image) return []
    const appearances: Array<{ startTime: number; endTime: number; position: string }> =
      params.appearances || [{ startTime: 0, endTime: 3, position: 'top-right' }]

    if (appearances.length === 0) return []

    const inputIdx = ctx.nextInputIndex() - 1
    const key = ctx.instanceKey
    const sizePercent = (params.size ?? 10) / 100
    const targetW = Math.round(ctx.inputWidth * sizePercent)
    const opacity = params.opacity ?? 0.9
    const padding = 15

    const filters: FFmpegFilter[] = []

    // Scale logo once
    filters.push({
      filter: 'scale',
      options: { w: targetW, h: -1 },
      inputs: [`${inputIdx}:v`],
      outputs: [`logo_${key}`],
    })

    // Apply opacity
    if (opacity < 1.0) {
      filters.push({
        filter: 'colorchannelmixer',
        options: { aa: opacity },
        inputs: [`logo_${key}`],
        outputs: [`logo_a_${key}`],
      })
    }
    const logoLabel = opacity < 1.0 ? `logo_a_${key}` : `logo_${key}`

    // Chain overlays (each appearance is a separate overlay in sequence)
    let prevVideoLabel = '0:v'
    for (let i = 0; i < appearances.length; i++) {
      const a = appearances[i]
      const { x, y } = resolveOverlayPosition(a.position, padding)
      const outLabel = i === appearances.length - 1 ? `out_${key}` : `logo_step_${key}_${i}`

      filters.push({
        filter: 'overlay',
        options: {
          x, y,
          enable: `between(t,${a.startTime},${a.endTime})`,
        },
        inputs: [prevVideoLabel, logoLabel],
        outputs: [outLabel],
      })
      prevVideoLabel = outLabel
    }

    return filters
  },

  validate(params) {
    if (!params.image) return 'Logo image is required'
    const appearances = params.appearances || []
    for (let i = 0; i < appearances.length; i++) {
      const a = appearances[i]
      if (a.endTime <= a.startTime) return `Appearance ${i + 1}: end must be after start`
    }
    return null
  },
}

function resolveOverlayPosition(position: string, padding: number): { x: string; y: string } {
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
  return POSITIONS[position] || POSITIONS['top-right']
}

export default logoSequence

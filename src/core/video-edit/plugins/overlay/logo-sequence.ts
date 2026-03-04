/**
 * Plugin: Logo at Timestamps
 * Display an image at multiple specific time ranges with different positions.
 * Think: a logo that appears at different corners at different times.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const logoSequence: VideoEditPlugin = {
  id: 'builtin.logo_sequence',
  name: 'Logo Sequence',
  group: 'overlay',
  icon: 'slideshow',
  description: 'Show image at specific timestamps with different positions',
  allowMultipleInstances: false,
  previewHint: 'overlay-image',

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
    {
      key: 'timeJitterSec',
      type: 'slider',
      label: 'Random time jitter',
      default: 0,
      min: 0,
      max: 10,
      step: 0.1,
      unit: 's',
      description: 'Randomly shifts each appearance timing on render',
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

    const inputIdx = ctx.additionalInputStartIndex ?? ctx.nextInputIndex()
    const key = ctx.instanceKey
    const sizePercent = (params.size ?? 10) / 100
    const targetW = Math.round(ctx.inputWidth * sizePercent)
    const opacity = params.opacity ?? 0.9
    const padding = 15
    const jitter = Math.max(0, Number(params.timeJitterSec ?? 0))

    const filters: VideoFilter[] = []

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
      const start = clampTime(Number(a.startTime ?? 0) + randomJitter(jitter), 0, ctx.inputDurationSec)
      const end = clampTime(Number(a.endTime ?? ctx.inputDurationSec) + randomJitter(jitter), start + 0.05, ctx.inputDurationSec)

      filters.push({
        filter: 'overlay',
        options: {
          x, y,
          enable: `between(t,${start},${end})`,
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

function randomJitter(maxSeconds: number): number {
  if (maxSeconds <= 0) return 0
  return (Math.random() * 2 - 1) * maxSeconds
}

function clampTime(value: number, min: number, max: number): number {
  const v = Number.isFinite(value) ? value : min
  if (max <= min) return max
  return Math.max(min, Math.min(max, v))
}

export default logoSequence

/**
 * Plugin: Text Watermark
 * Render text overlay directly via FFmpeg drawtext filter.
 * Multi-instance: user can add multiple text overlays.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const watermarkText: VideoEditPlugin = {
  id: 'builtin.watermark_text',
  name: 'Text Watermark',
  group: 'overlay',
  icon: 'text',
  description: 'Add text overlay on video',
  allowMultipleInstances: true,
  addInstanceLabel: 'Add another text',
  previewHint: 'overlay-text',

  configSchema: [
    {
      key: 'text',
      type: 'string',
      label: 'Text',
      default: '',
      placeholder: 'Enter watermark text...',
      required: true,
    },
    {
      key: 'fontSize',
      type: 'slider',
      label: 'Font size',
      default: 24,
      min: 10,
      max: 120,
      step: 2,
      unit: 'px',
    },
    {
      key: 'fontColor',
      type: 'color',
      label: 'Text color',
      default: '#ffffff',
    },
    {
      key: 'bgColor',
      type: 'color',
      label: 'Background color',
      default: '#000000',
      description: 'Background box color (set opacity below to 0 for no background)',
    },
    {
      key: 'bgOpacity',
      type: 'slider',
      label: 'Background opacity',
      default: 0.5,
      min: 0,
      max: 1.0,
      step: 0.1,
    },
    {
      key: 'position',
      type: 'position',
      label: 'Position',
      default: 'bottom-center',
    },
    {
      key: 'outline',
      type: 'boolean',
      label: 'Text outline/shadow',
      default: true,
    },
    {
      key: 'timeRange',
      type: 'timeRange',
      label: 'Visible during',
      description: 'Leave empty for entire video',
    },
  ],

  buildFilters(params, ctx) {
    const text = params.text?.trim()
    if (!text) return []

    const fontSize = params.fontSize ?? 24
    const fontColor = (params.fontColor || '#ffffff').replace('#', '')
    const bgColor = (params.bgColor || '#000000').replace('#', '')
    const bgOpacity = params.bgOpacity ?? 0.5
    const outline = params.outline ?? true
    const padding = 20

    // Resolve position to x/y expressions
    const pos = resolveTextPosition(params.position || 'bottom-center', padding)

    const drawtextOpts: Record<string, any> = {
      text: escapeDrawtext(text),
      fontsize: fontSize,
      fontcolor: fontColor,
      x: pos.x,
      y: pos.y,
    }

    // Background box
    if (bgOpacity > 0) {
      drawtextOpts.box = 1
      drawtextOpts.boxcolor = `${bgColor}@${bgOpacity}`
      drawtextOpts.boxborderw = 8
    }

    // Outline/shadow
    if (outline) {
      drawtextOpts.shadowcolor = 'black@0.5'
      drawtextOpts.shadowx = 2
      drawtextOpts.shadowy = 2
    }

    // Time range enable
    const start = params.timeRange?.start
    const end = params.timeRange?.end
    if (start != null || end != null) {
      const s = start ?? 0
      const e = end ?? ctx.inputDurationSec
      drawtextOpts.enable = `between(t,${s},${e})`
    }

    const filters: VideoFilter[] = [{
      filter: 'drawtext',
      options: drawtextOpts,
      inputs: [],   // auto-wired
      outputs: [],  // auto-wired
    }]

    return filters
  },

  validate(params) {
    if (!params.text?.trim()) return 'Text is required'
    return null
  },
}

// -- Text helpers --

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
}

function resolveTextPosition(
  position: string | { x: number; y: number },
  padding: number,
): { x: string; y: string } {
  if (typeof position === 'object' && position.x != null) {
    // Canvas sends % values — use FFmpeg expressions to convert at render time
    return {
      x: `w*${position.x}/100`,
      y: `h*${position.y}/100`,
    }
  }

  const p = String(position || 'bottom-center')
  const POSITIONS: Record<string, { x: string; y: string }> = {
    'top-left':      { x: `${padding}`, y: `${padding}` },
    'top-center':    { x: '(w-text_w)/2', y: `${padding}` },
    'top-right':     { x: `w-text_w-${padding}`, y: `${padding}` },
    'center-left':   { x: `${padding}`, y: '(h-text_h)/2' },
    'center':        { x: '(w-text_w)/2', y: '(h-text_h)/2' },
    'center-right':  { x: `w-text_w-${padding}`, y: '(h-text_h)/2' },
    'bottom-left':   { x: `${padding}`, y: `h-text_h-${padding}` },
    'bottom-center': { x: '(w-text_w)/2', y: `h-text_h-${padding}` },
    'bottom-right':  { x: `w-text_w-${padding}`, y: `h-text_h-${padding}` },
  }

  return POSITIONS[p] || POSITIONS['bottom-center']
}

export default watermarkText

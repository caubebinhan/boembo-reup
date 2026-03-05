/**
 * Plugin: Text Watermark
 * Render text overlay directly via FFmpeg drawtext filter.
 * Multi-instance: user can add multiple text overlays.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
      key: 'fontFamily',
      type: 'select',
      label: 'Font family',
      default: 'Arial',
      options: [
        { value: 'Arial', label: 'Arial' },
        { value: 'Verdana', label: 'Verdana' },
        { value: 'Tahoma', label: 'Tahoma' },
        { value: 'Georgia', label: 'Georgia' },
        { value: 'Courier New', label: 'Courier New' },
      ],
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

  buildFilters(params, ctx) {
    const text = params.text?.trim()
    if (!text) return []

    const fontSize = params.fontSize ?? 24
    const fontFamily = String(params.fontFamily || 'Arial')
    const fontfile = resolveFontFile(fontFamily)
    const fontColor = normalizeDrawtextColor(params.fontColor || '#ffffff')
    const bgColor = normalizeDrawtextColor(params.bgColor || '#000000')
    const bgOpacity = params.bgOpacity ?? 0.5
    const outline = params.outline ?? true
    const padding = 20

    // Resolve position to x/y expressions
    const pos = resolveTextPosition(params.position || 'bottom-center', padding)

    const drawtextOpts: Record<string, string | number> = {
      text: escapeDrawtext(text),
      fontsize: fontSize,
      fontcolor: fontColor,
      x: pos.x,
      y: pos.y,
    }
    if (fontfile) drawtextOpts.fontfile = fontfile

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
    const jitter = Math.max(0, Number(params.timeJitterSec ?? 0))
    if (start != null || end != null || jitter > 0) {
      const s = clampTime((start ?? 0) + randomJitter(jitter), 0, ctx.inputDurationSec)
      const e = clampTime((end ?? ctx.inputDurationSec) + randomJitter(jitter), s + 0.05, ctx.inputDurationSec)
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

function normalizeDrawtextColor(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return '0xffffff'
  if (raw.startsWith('#') && /^#[0-9a-fA-F]{6}$/.test(raw)) return `0x${raw.slice(1)}`
  return raw
}

const FONT_FILE_CANDIDATES: Record<string, string[]> = {
  Arial: ['arial.ttf'],
  Verdana: ['verdana.ttf'],
  Tahoma: ['tahoma.ttf'],
  Georgia: ['georgia.ttf'],
  'Courier New': ['cour.ttf', 'courbd.ttf'],
}

function resolveFontFile(fontFamily: string): string | null {
  const candidates = FONT_FILE_CANDIDATES[fontFamily] || []
  if (candidates.length === 0) return null

  const winDir = process.env.WINDIR || 'C:/Windows'
  for (const file of candidates) {
    const fullPath = join(winDir, 'Fonts', file)
    if (!existsSync(fullPath)) continue
    return fullPath.replace(/\\/g, '/')
  }
  return null
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

function randomJitter(maxSeconds: number): number {
  if (maxSeconds <= 0) return 0
  return (Math.random() * 2 - 1) * maxSeconds
}

function clampTime(value: number, min: number, max: number): number {
  const v = Number.isFinite(value) ? value : min
  if (max <= min) return max
  return Math.max(min, Math.min(max, v))
}

export default watermarkText

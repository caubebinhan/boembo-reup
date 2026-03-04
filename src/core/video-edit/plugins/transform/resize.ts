/**
 * Plugin: Resize / Scale
 * ──────────────────────
 * Resize video to specific dimensions with fit/fill/stretch modes.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

function normalizePadColor(value: unknown): string {
  const raw = String(value || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return `0x${raw.slice(1)}`
  if (/^0x[0-9a-fA-F]{6}$/.test(raw)) return raw
  return 'black'
}

const resize: VideoEditPlugin = {
  id: 'builtin.resize',
  name: 'Resize / Scale',
  group: 'transform',
  icon: 'scale',
  description: 'Resize video to target dimensions',
  previewHint: 'transform',

  configSchema: [
    {
      key: 'width',
      type: 'number',
      label: 'Width',
      default: -1,
      min: -1,
      description: 'Target width (-1 = auto)',
    },
    {
      key: 'height',
      type: 'number',
      label: 'Height',
      default: -1,
      min: -1,
      description: 'Target height (-1 = auto)',
    },
    {
      key: 'scaleMode',
      type: 'select',
      label: 'Scale mode',
      default: 'fit',
      options: [
        { value: 'fit', label: 'Fit (preserve aspect ratio)' },
        { value: 'fill', label: 'Fill (crop to fit)' },
        { value: 'stretch', label: 'Stretch (distort)' },
      ],
    },
    {
      key: 'upscaleAllowed',
      type: 'boolean',
      label: 'Allow upscaling',
      default: false,
      description: 'Allow making the video larger than original',
    },
    {
      key: 'padColor',
      type: 'color',
      label: 'Padding color',
      default: '#000000',
      description: 'Used when fitting/scaling smaller than the canvas',
    },
  ],

  buildFilters(params, ctx) {
    const filters: VideoFilter[] = []
    let w = params.width ?? -1
    let h = params.height ?? -1
    const mode = params.scaleMode || 'fit'
    const upscale = params.upscaleAllowed ?? false
    const padColor = normalizePadColor(params.padColor)
    const widthPercent = params.widthPercent
    const heightPercent = params.heightPercent
    const offset = params.offsetPercent || params.canvasRect || null

    // Canvas interactive mode: scale relative to input size and place inside original frame.
    if (widthPercent != null || heightPercent != null || offset) {
      const wp = Math.max(5, Math.min(100, Number(widthPercent ?? 100)))
      const hp = Math.max(5, Math.min(100, Number(heightPercent ?? 100)))
      const targetW = Math.max(16, Math.round((ctx.inputWidth * wp) / 100) & ~1)
      const targetH = Math.max(16, Math.round((ctx.inputHeight * hp) / 100) & ~1)
      const xPercent = Math.max(0, Math.min(100 - wp, Number(offset?.x ?? ((100 - wp) / 2))))
      const yPercent = Math.max(0, Math.min(100 - hp, Number(offset?.y ?? ((100 - hp) / 2))))
      const xPad = Math.round((ctx.inputWidth * xPercent) / 100)
      const yPad = Math.round((ctx.inputHeight * yPercent) / 100)

      filters.push({
        filter: 'scale',
        options: {
          w: targetW,
          h: targetH,
          force_original_aspect_ratio: mode === 'stretch' ? undefined : 'decrease',
        },
      })
      filters.push({
        filter: 'pad',
        options: {
          w: ctx.inputWidth,
          h: ctx.inputHeight,
          x: Math.max(0, Math.min(ctx.inputWidth - targetW, xPad)),
          y: Math.max(0, Math.min(ctx.inputHeight - targetH, yPad)),
          color: padColor,
        },
      })
      return filters
    }

    // If both are -1, nothing to do
    if (w === -1 && h === -1) return filters

    // Prevent upscale if not allowed
    if (!upscale) {
      if (w > ctx.inputWidth && w !== -1) w = ctx.inputWidth
      if (h > ctx.inputHeight && h !== -1) h = ctx.inputHeight
    }

    // Make even numbers (required by encoders)
    if (w !== -1) w = w - (w % 2)
    if (h !== -1) h = h - (h % 2)

    switch (mode) {
      case 'fit':
        // scale + pad: maintain aspect ratio, letterbox if needed
        filters.push({
          filter: 'scale',
          options: {
            w: w === -1 ? '-2' : w,
            h: h === -1 ? '-2' : h,
            force_original_aspect_ratio: 'decrease',
          },
        })
        if (w !== -1 && h !== -1) {
          filters.push({
            filter: 'pad',
            options: { w, h, x: '(ow-iw)/2', y: '(oh-ih)/2', color: padColor },
          })
        }
        break

      case 'fill':
        // scale + crop: fill exact dimensions, crop overflow
        filters.push({
          filter: 'scale',
          options: {
            w: w === -1 ? '-2' : w,
            h: h === -1 ? '-2' : h,
            force_original_aspect_ratio: 'increase',
          },
        })
        if (w !== -1 && h !== -1) {
          filters.push({
            filter: 'crop',
            options: { w, h },
          })
        }
        break

      case 'stretch':
        filters.push({
          filter: 'scale',
          options: {
            w: w === -1 ? 'iw' : w,
            h: h === -1 ? 'ih' : h,
          },
        })
        break
    }

    return filters
  },

  validate(params) {
    const w = params.width ?? -1
    const h = params.height ?? -1
    if (w === -1 && h === -1) return 'At least one dimension (width or height) is required'
    if (w !== -1 && w < 16) return 'Width too small (minimum 16px)'
    if (h !== -1 && h < 16) return 'Height too small (minimum 16px)'
    return null
  },
}

export default resize

/**
 * Plugin: Resize / Scale
 * ──────────────────────
 * Resize video to specific dimensions with fit/fill/stretch modes.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const resize: VideoEditPlugin = {
  id: 'builtin.resize',
  name: 'Resize / Scale',
  group: 'transform',
  icon: 'scale',
  description: 'Resize video to target dimensions',

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
  ],

  buildFilters(params, ctx) {
    const filters: VideoFilter[] = []
    let w = params.width ?? -1
    let h = params.height ?? -1
    const mode = params.scaleMode || 'fit'
    const upscale = params.upscaleAllowed ?? false

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
            w: w === -1 ? '-1' : w,
            h: h === -1 ? '-1' : h,
            force_original_aspect_ratio: 'decrease',
          },
        })
        if (w !== -1 && h !== -1) {
          filters.push({
            filter: 'pad',
            options: { w, h, x: '(ow-iw)/2', y: '(oh-ih)/2', color: 'black' },
          })
        }
        break

      case 'fill':
        // scale + crop: fill exact dimensions, crop overflow
        filters.push({
          filter: 'scale',
          options: {
            w: w === -1 ? '-1' : w,
            h: h === -1 ? '-1' : h,
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

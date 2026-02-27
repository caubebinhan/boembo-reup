/**
 * Plugin: Mirror + Slight Zoom
 * ────────────────────────────
 * Mirrors the video horizontally/vertically with a slight zoom
 * to change visual fingerprint while keeping content recognizable.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const mirrorFlip: VideoEditPlugin = {
  id: 'builtin.mirror_flip',
  name: 'Mirror + Zoom',
  group: 'anti-detect',
  icon: '🪞',
  description: 'Mirror and slightly zoom to change visual fingerprint',
  defaultEnabled: false,

  configSchema: [
    {
      key: 'flipAxis',
      type: 'select',
      label: 'Flip direction',
      default: 'h',
      options: [
        { value: 'h', label: 'Horizontal (mirror)' },
        { value: 'v', label: 'Vertical' },
        { value: 'both', label: 'Both' },
      ],
    },
    {
      key: 'zoom',
      type: 'slider',
      label: 'Zoom factor',
      default: 1.02,
      min: 1.0,
      max: 1.10,
      step: 0.01,
      description: 'Slight zoom to crop edges (1.0 = no zoom)',
    },
  ],

  buildFilters(params, ctx) {
    const filters: FFmpegFilter[] = []
    const flip = params.flipAxis || 'h'
    const zoom = params.zoom ?? 1.02

    // Flip filter(s)
    if (flip === 'h' || flip === 'both') {
      filters.push({ filter: 'hflip', options: {} })
    }
    if (flip === 'v' || flip === 'both') {
      filters.push({ filter: 'vflip', options: {} })
    }

    // Zoom via scale + crop (to maintain original dimensions)
    if (zoom > 1.0) {
      const scaledW = Math.round(ctx.inputWidth * zoom)
      const scaledH = Math.round(ctx.inputHeight * zoom)
      filters.push({
        filter: 'scale',
        options: { w: scaledW, h: scaledH },
      })
      filters.push({
        filter: 'crop',
        options: { w: ctx.inputWidth, h: ctx.inputHeight },
      })
    }

    return filters
  },
}

export default mirrorFlip

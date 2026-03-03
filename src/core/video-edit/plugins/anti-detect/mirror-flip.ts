/**
 * Plugin: Mirror + Slight Zoom
 * Mirrors the video horizontally/vertically with a slight zoom
 * to change visual fingerprint while keeping content recognizable.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const mirrorFlip: VideoEditPlugin = {
  id: 'builtin.mirror_flip',
  name: 'Mirror + Zoom',
  group: 'anti-detect',
  icon: 'mirror',
  description: 'Mirror and slightly zoom to change visual fingerprint',
  defaultEnabled: false,
  warning: 'Visibly flips the video. Text and logos will appear mirrored. Not suitable for all content.',

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
      min: 1,
      max: 1.1,
      step: 0.01,
      description: 'Slight zoom to crop edges (1.0 = no zoom)',
    },
  ],

  buildFilters(params, ctx) {
    const filters: VideoFilter[] = []
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
    if (zoom > 1) {
      const scaledW = Math.round(ctx.inputWidth * zoom)
      const scaledH = Math.round(ctx.inputHeight * zoom)
      filters.push({
        filter: 'scale',
        options: { w: scaledW, h: scaledH },
      }, {
        filter: 'crop',
        options: { w: ctx.inputWidth, h: ctx.inputHeight },
      })
    }

    return filters
  },
}

export default mirrorFlip

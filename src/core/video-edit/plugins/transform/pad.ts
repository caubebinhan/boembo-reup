/**
 * Plugin: Add Background / Pad
 * Add colored/blurred background and resize video to target dimensions.
 * Useful for converting portrait to landscape with padding.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const pad: VideoEditPlugin = {
  id: 'builtin.pad',
  name: 'Add Background / Pad',
  group: 'transform',
  icon: 'frame',
  description: 'Add colored/blurred background padding to video',

  configSchema: [
    {
      key: 'targetWidth',
      type: 'number',
      label: 'Target width',
      default: 1080,
      min: 100,
      max: 3840,
    },
    {
      key: 'targetHeight',
      type: 'number',
      label: 'Target height',
      default: 1920,
      min: 100,
      max: 3840,
    },
    {
      key: 'bgMode',
      type: 'select',
      label: 'Background mode',
      default: 'color',
      options: [
        { value: 'color', label: 'Solid color' },
        { value: 'blur', label: 'Blurred video background' },
      ],
    },
    {
      key: 'bgColor',
      type: 'color',
      label: 'Background color',
      default: '#000000',
      condition: { field: 'bgMode', value: 'color' },
    },
    {
      key: 'blurStrength',
      type: 'slider',
      label: 'Blur strength',
      default: 20,
      min: 5,
      max: 50,
      step: 5,
      condition: { field: 'bgMode', value: 'blur' },
    },
  ],

  buildFilters(params, ctx) {
    const targetW = params.targetWidth || 1080
    const targetH = params.targetHeight || 1920
    const bgMode = params.bgMode || 'color'
    const filters: VideoFilter[] = []

    // Calculate scaled dimensions to fit inside target aspect ratio
    const inputRatio = ctx.inputWidth / ctx.inputHeight
    const targetRatio = targetW / targetH

    let scaledW: number, scaledH: number
    if (inputRatio > targetRatio) {
      // Input is wider -> fit to width
      scaledW = targetW
      scaledH = Math.round(targetW / inputRatio / 2) * 2
    } else {
      // Input is taller -> fit to height
      scaledH = targetH
      scaledW = Math.round(targetH * inputRatio / 2) * 2
    }

    if (bgMode === 'blur') {
      // Layer 1: Blurred background (scale to fill target)
      filters.push({
        filter: 'scale',
        options: { w: targetW, h: targetH },
        inputs: ['0:v'],
        outputs: ['bg_scaled'],
      })
      filters.push({
        filter: 'boxblur',
        options: { luma_radius: params.blurStrength || 20 },
        inputs: ['bg_scaled'],
        outputs: ['bg_blur'],
      })
      // Layer 2: Sharp scaled video on top
      filters.push({
        filter: 'scale',
        options: { w: scaledW, h: scaledH },
        inputs: ['0:v'],
        outputs: ['fg_scaled'],
      })
      // Overlay centered
      filters.push({
        filter: 'overlay',
        options: { x: '(W-w)/2', y: '(H-h)/2' },
        inputs: ['bg_blur', 'fg_scaled'],
        outputs: ['out'],
      })
    } else {
      // Solid color: scale original to target fit, then pad
      const bgHex = (params.bgColor || '#000000').replace('#', '0x')
      filters.push({
        filter: 'scale',
        options: { w: scaledW, h: scaledH },
      })
      filters.push({
        filter: 'pad',
        options: {
          w: targetW,
          h: targetH,
          x: '(ow-iw)/2',
          y: '(oh-ih)/2',
          color: bgHex,
        },
      })
    }

    return filters
  },

  validate(params) {
    if (!params.targetWidth || params.targetWidth < 100) return 'Target width must be at least 100'
    if (!params.targetHeight || params.targetHeight < 100) return 'Target height must be at least 100'
    return null
  },
}

export default pad

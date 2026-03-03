/**
 * Plugin: Smart Crop
 * Crop video to specific dimensions, aspect ratio, or position.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const crop: VideoEditPlugin = {
  id: 'builtin.crop',
  name: 'Smart Crop',
  group: 'transform',
  icon: 'crop',
  description: 'Crop video by dimensions or aspect ratio',
  previewHint: 'crop-guide',

  configSchema: [
    {
      key: 'mode',
      type: 'select',
      label: 'Crop mode',
      default: 'aspect',
      options: [
        { value: 'manual', label: 'Manual (x, y, w, h)' },
        { value: 'aspect', label: 'Aspect ratio' },
      ],
    },
    // Manual mode fields
    { key: 'x', type: 'number', label: 'X offset', default: 0, min: 0, condition: { field: 'mode', value: 'manual' } },
    { key: 'y', type: 'number', label: 'Y offset', default: 0, min: 0, condition: { field: 'mode', value: 'manual' } },
    { key: 'w', type: 'number', label: 'Width', default: 0, min: 1, condition: { field: 'mode', value: 'manual' } },
    { key: 'h', type: 'number', label: 'Height', default: 0, min: 1, condition: { field: 'mode', value: 'manual' } },
    // Aspect ratio mode fields
    {
      key: 'aspectRatio',
      type: 'select',
      label: 'Target aspect ratio',
      default: '9:16',
      options: [
        { value: '9:16', label: '9:16 (Portrait)' },
        { value: '16:9', label: '16:9 (Landscape)' },
        { value: '1:1', label: '1:1 (Square)' },
        { value: '4:3', label: '4:3' },
        { value: '4:5', label: '4:5 (Instagram)' },
      ],
      condition: { field: 'mode', value: 'aspect' },
    },
    {
      key: 'position',
      type: 'select',
      label: 'Crop position',
      default: 'center',
      options: [
        { value: 'center', label: 'Center' },
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
      ],
      condition: { field: 'mode', value: 'aspect' },
    },
  ],

  buildFilters(params, ctx) {
    const filters: VideoFilter[] = []
    const mode = params.mode || 'aspect'

    if (mode === 'manual') {
      const w = params.w || ctx.inputWidth
      const h = params.h || ctx.inputHeight
      const x = params.x || 0
      const y = params.y || 0
      filters.push({ filter: 'crop', options: { w, h, x, y } })
    } else {
      // Aspect ratio mode
      const [ratioW, ratioH] = (params.aspectRatio || '9:16').split(':').map(Number)
      const targetRatio = ratioW / ratioH
      const currentRatio = ctx.inputWidth / ctx.inputHeight

      let cropW: number, cropH: number
      if (currentRatio > targetRatio) {
        // Video is wider -> crop width
        cropH = ctx.inputHeight
        cropW = Math.round(cropH * targetRatio)
      } else {
        // Video is taller -> crop height
        cropW = ctx.inputWidth
        cropH = Math.round(cropW / targetRatio)
      }

      // Make even numbers (required by most codecs)
      cropW = cropW - (cropW % 2)
      cropH = cropH - (cropH % 2)

      // Position
      const position = params.position || 'center'
      let x = '(in_w-out_w)/2'
      let y = '(in_h-out_h)/2'
      if (position === 'top') y = '0'
      else if (position === 'bottom') y = 'in_h-out_h'

      filters.push({ filter: 'crop', options: { w: cropW, h: cropH, x, y } })
    }

    return filters
  },

  validate(params) {
    if (params.mode === 'manual') {
      if (!params.w || !params.h) return 'Width and height are required for manual crop'
      if (params.w < 1 || params.h < 1) return 'Crop dimensions must be positive'
    }
    return null
  },
}

export default crop

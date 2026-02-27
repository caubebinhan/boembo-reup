/**
 * Plugin: Add Background / Pad
 * ────────────────────────────
 * Add colored/blurred background and resize video to target aspect ratio.
 * Common for converting landscape to portrait (9:16) with blur effect.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const pad: VideoEditPlugin = {
  id: 'builtin.pad',
  name: 'Add Background',
  group: 'transform',
  icon: '🖼️',
  description: 'Add background padding for aspect ratio conversion',

  configSchema: [
    {
      key: 'targetAspect',
      type: 'select',
      label: 'Target aspect ratio',
      default: '9:16',
      options: [
        { value: '9:16', label: '9:16 (TikTok/Reels)' },
        { value: '16:9', label: '16:9 (YouTube)' },
        { value: '1:1', label: '1:1 (Square)' },
        { value: '4:5', label: '4:5 (Instagram)' },
      ],
    },
    {
      key: 'bgMode',
      type: 'select',
      label: 'Background mode',
      default: 'blur',
      options: [
        { value: 'color', label: 'Solid color' },
        { value: 'blur', label: 'Blurred original' },
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
    const [ratioW, ratioH] = (params.targetAspect || '9:16').split(':').map(Number)
    const targetRatio = ratioW / ratioH
    const currentRatio = ctx.inputWidth / ctx.inputHeight

    // If already matches target ratio → skip
    if (Math.abs(currentRatio - targetRatio) < 0.05) return []

    // Calculate target dimensions (fitting within original)
    let targetW: number, targetH: number
    if (targetRatio > currentRatio) {
      // Target is wider → height stays, width increases
      targetH = ctx.inputHeight
      targetW = Math.round(targetH * targetRatio)
    } else {
      // Target is taller → width stays, height increases
      targetW = ctx.inputWidth
      targetH = Math.round(targetW / targetRatio)
    }

    // Make even
    targetW = targetW - (targetW % 2)
    targetH = targetH - (targetH % 2)

    // Calculate scaled video to fit inside target
    let scaledW: number, scaledH: number
    const videoRatio = ctx.inputWidth / ctx.inputHeight
    if (videoRatio > targetRatio) {
      scaledW = targetW
      scaledH = Math.round(targetW / videoRatio)
    } else {
      scaledH = targetH
      scaledW = Math.round(targetH * videoRatio)
    }
    scaledW = scaledW - (scaledW % 2)
    scaledH = scaledH - (scaledH % 2)

    const bgMode = params.bgMode || 'blur'
    const filters: FFmpegFilter[] = []

    if (bgMode === 'blur') {
      // Blur trick: scale original to target, blur, overlay sharp scaled video on top
      const blurStr = params.blurStrength ?? 20

      // bg: scale original to fill target
      filters.push({
        filter: 'scale',
        options: { w: targetW, h: targetH },
        inputs: ['0:v'],
        outputs: ['bg_scaled'],
      })
      filters.push({
        filter: 'boxblur',
        options: { luma_radius: blurStr, luma_power: 2 },
        inputs: ['bg_scaled'],
        outputs: ['bg_blur'],
      })

      // fg: scale original to fit inside target
      filters.push({
        filter: 'scale',
        options: { w: scaledW, h: scaledH },
        inputs: ['0:v'],
        outputs: ['fg_scaled'],
      })

      // Overlay fg centered on bg
      const overlayX = Math.round((targetW - scaledW) / 2)
      const overlayY = Math.round((targetH - scaledH) / 2)
      filters.push({
        filter: 'overlay',
        options: { x: overlayX, y: overlayY },
        inputs: ['bg_blur', 'fg_scaled'],
        outputs: ['out'],
      })
    } else {
      // Solid color pad
      const color = params.bgColor || '#000000'
      filters.push({
        filter: 'scale',
        options: { w: scaledW, h: scaledH },
        inputs: ['0:v'],
        outputs: ['scaled'],
      })
      filters.push({
        filter: 'pad',
        options: {
          w: targetW,
          h: targetH,
          x: '(ow-iw)/2',
          y: '(oh-ih)/2',
          color: color.replace('#', '0x'),
        },
        inputs: ['scaled'],
        outputs: ['out'],
      })
    }

    return filters
  },
}

export default pad

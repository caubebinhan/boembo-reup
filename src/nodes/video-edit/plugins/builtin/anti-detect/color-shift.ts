/**
 * Plugin: Color Shift
 * ───────────────────
 * Subtle color/contrast modification to defeat perceptual hashing.
 *
 * Theory: Perceptual hashing (PDQ) uses DCT to extract low-frequency
 * spatial features. While robust against minor color changes, the
 * combination of contrast adjustment + saturation shift + micro-rotation
 * + asymmetric scaling creates enough pixel-level displacement that
 * hash Hamming distance exceeds detection threshold.
 *
 * Strategy: Apply multiple imperceptible modifications simultaneously:
 *   1. eq: contrast + saturation + brightness micro-adjustments
 *   2. rotate: micro-rotation (1-3°) to shift keypoints off pixel grid
 *   3. scale: asymmetric scaling (slightly different X/Y ratio)
 *
 * These are individually invisible but collectively devastating to hashing.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const colorShift: VideoEditPlugin = {
  id: 'builtin.color_shift',
  name: 'Hash Evasion',
  group: 'anti-detect',
  icon: '🎯',
  description: 'Micro color/geometry shifts to defeat perceptual hashing (PDQ/vPDQ)',
  defaultEnabled: true,

  configSchema: [
    {
      key: 'colorShift',
      type: 'boolean',
      label: 'Color micro-shift',
      default: true,
      description: 'Subtle brightness/contrast/saturation changes',
    },
    {
      key: 'microRotate',
      type: 'boolean',
      label: 'Micro-rotation',
      default: true,
      description: 'Rotate 1-3° — shifts keypoints off standard pixel grid',
    },
    {
      key: 'rotationDegree',
      type: 'slider',
      label: 'Rotation angle',
      default: 1.5,
      min: 0.5,
      max: 3.0,
      step: 0.5,
      unit: '°',
      condition: { field: 'microRotate', value: true },
    },
    {
      key: 'asymmetricScale',
      type: 'boolean',
      label: 'Asymmetric scaling',
      default: true,
      description: 'Slightly different X/Y scale ratio to break grid alignment',
    },
  ],

  buildFilters(params, ctx) {
    const key = ctx.instanceKey
    const filters: FFmpegFilter[] = []

    // Step 1: Color micro-shift
    if (params.colorShift !== false) {
      // Randomize slightly for each video
      const contrast = 1.0 + (Math.random() * 0.08 - 0.02)  // 0.98-1.06
      const brightness = (Math.random() * 0.04 - 0.01)       // -0.01 to 0.03
      const saturation = 1.0 + (Math.random() * 0.15 - 0.05) // 0.95-1.10
      const gamma = 1.0 + (Math.random() * 0.06 - 0.02)      // 0.98-1.04

      filters.push({
        filter: 'eq',
        options: {
          contrast: Math.round(contrast * 100) / 100,
          brightness: Math.round(brightness * 100) / 100,
          saturation: Math.round(saturation * 100) / 100,
          gamma: Math.round(gamma * 100) / 100,
        },
        outputs: [`eq_${key}`],
      })
    }

    const prevLabel = filters.length > 0 ? `eq_${key}` : undefined

    // Step 2: Micro-rotation — shifts all keypoints off standard pixel grid
    if (params.microRotate !== false) {
      const degree = params.rotationDegree ?? 1.5
      // Random direction
      const direction = Math.random() > 0.5 ? 1 : -1
      const radians = (degree * direction * Math.PI) / 180

      filters.push({
        filter: 'rotate',
        options: {
          angle: radians,
          fillcolor: 'none',
          ow: 'rotw(iw)',
          oh: 'roth(ih)',
        },
        inputs: prevLabel ? [prevLabel] : undefined,
        outputs: [`rot_${key}`],
      })

      // Crop back to original dimensions (remove rotation artifacts)
      filters.push({
        filter: 'crop',
        options: {
          w: ctx.inputWidth,
          h: ctx.inputHeight,
          x: '(iw-ow)/2',
          y: '(ih-oh)/2',
        },
        inputs: [`rot_${key}`],
        outputs: [`crop_${key}`],
      })
    }

    const afterRotLabel = params.microRotate !== false ? `crop_${key}` : prevLabel

    // Step 3: Asymmetric scaling — different X/Y ratio breaks grid alignment
    if (params.asymmetricScale !== false) {
      // Scale X by 100-102%, Y by 99-101% (imperceptible)
      const scaleX = 1.0 + (Math.random() * 0.02)  // 1.00-1.02
      const scaleY = 0.99 + (Math.random() * 0.02)  // 0.99-1.01
      const newW = Math.round(ctx.inputWidth * scaleX / 2) * 2
      const newH = Math.round(ctx.inputHeight * scaleY / 2) * 2

      filters.push({
        filter: 'scale',
        options: { w: newW, h: newH },
        inputs: afterRotLabel ? [afterRotLabel] : undefined,
        outputs: [`asym_${key}`],
      })

      // Scale back to exact original dimensions
      filters.push({
        filter: 'scale',
        options: { w: ctx.inputWidth, h: ctx.inputHeight },
        inputs: [`asym_${key}`],
        outputs: [`out_${key}`],
      })
    }

    return filters
  },
}

export default colorShift

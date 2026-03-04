/**
 * Plugin: Background Video
 * Compose current video over another video background.
 */
import type { VideoEditPlugin, VideoFilter } from '@core/video-edit/types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function even(value: number): number {
  const rounded = Math.round(value)
  return rounded - (rounded % 2)
}

function resolveForegroundPosition(
  position: string | { x: number; y: number },
  padding: number,
): { x: string | number; y: string | number } {
  if (typeof position === 'object' && position.x != null && position.y != null) {
    return {
      x: `W*${position.x}/100`,
      y: `H*${position.y}/100`,
    }
  }

  const p = String(position || 'center')
  const presets: Record<string, { x: string; y: string }> = {
    'top-left': { x: `${padding}`, y: `${padding}` },
    'top-center': { x: '(W-w)/2', y: `${padding}` },
    'top-right': { x: `W-w-${padding}`, y: `${padding}` },
    'center-left': { x: `${padding}`, y: '(H-h)/2' },
    center: { x: '(W-w)/2', y: '(H-h)/2' },
    'center-right': { x: `W-w-${padding}`, y: '(H-h)/2' },
    'bottom-left': { x: `${padding}`, y: `H-h-${padding}` },
    'bottom-center': { x: '(W-w)/2', y: `H-h-${padding}` },
    'bottom-right': { x: `W-w-${padding}`, y: `H-h-${padding}` },
  }
  return presets[p] || presets.center
}

const backgroundVideo: VideoEditPlugin = {
  id: 'builtin.background_video',
  name: 'Background Video',
  group: 'overlay',
  icon: '🎞️',
  description: 'Place video on top of a background video',
  allowMultipleInstances: false,

  configSchema: [
    {
      key: 'video',
      type: 'asset',
      label: 'Background video',
      description: 'MP4/MOV/WebM file for background',
      required: true,
    },
    {
      key: 'fitMode',
      type: 'select',
      label: 'Background fit',
      default: 'cover',
      options: [
        { value: 'cover', label: 'Cover' },
        { value: 'contain', label: 'Contain + pad' },
        { value: 'stretch', label: 'Stretch' },
      ],
    },
    {
      key: 'blur',
      type: 'slider',
      label: 'Background blur',
      default: 10,
      min: 0,
      max: 50,
      step: 1,
    },
    {
      key: 'foregroundScale',
      type: 'slider',
      label: 'Foreground size',
      default: 92,
      min: 20,
      max: 140,
      step: 1,
      unit: '%',
    },
    {
      key: 'foregroundPosition',
      type: 'position',
      label: 'Foreground position',
      default: 'center',
    },
    {
      key: 'padding',
      type: 'slider',
      label: 'Foreground padding',
      default: 0,
      min: 0,
      max: 200,
      step: 2,
      unit: 'px',
    },
  ],

  getAdditionalInputs(params, ctx) {
    const videoPath = ctx.assetResolver(params.video)
    return videoPath ? [videoPath] : []
  },

  buildFilters(params, ctx) {
    if (!params.video) return []

    const inputIdx = ctx.additionalInputStartIndex ?? ctx.nextInputIndex()
    const key = ctx.instanceKey
    const fitMode = String(params.fitMode || 'cover')
    const blur = clamp(Number(params.blur ?? 10), 0, 50)
    const foregroundScale = clamp(Number(params.foregroundScale ?? 92), 20, 140)
    const padding = clamp(Number(params.padding ?? 0), 0, 400)

    const filters: VideoFilter[] = []
    const bgStart = `bg_start_${key}`
    filters.push({
      filter: 'setpts',
      options: { expr: 'PTS-STARTPTS' },
      inputs: [`${inputIdx}:v`],
      outputs: [bgStart],
    })

    let bgLabel = `bg_${key}`
    if (fitMode === 'stretch') {
      filters.push({
        filter: 'scale',
        options: { w: ctx.inputWidth, h: ctx.inputHeight },
        inputs: [bgStart],
        outputs: [bgLabel],
      })
    } else if (fitMode === 'contain') {
      const scaled = `bg_scaled_${key}`
      filters.push({
        filter: 'scale',
        options: { w: ctx.inputWidth, h: ctx.inputHeight, force_original_aspect_ratio: 'decrease' },
        inputs: [bgStart],
        outputs: [scaled],
      })
      filters.push({
        filter: 'pad',
        options: { w: ctx.inputWidth, h: ctx.inputHeight, x: '(ow-iw)/2', y: '(oh-ih)/2', color: 'black' },
        inputs: [scaled],
        outputs: [bgLabel],
      })
    } else {
      const scaled = `bg_scaled_${key}`
      filters.push({
        filter: 'scale',
        options: { w: ctx.inputWidth, h: ctx.inputHeight, force_original_aspect_ratio: 'increase' },
        inputs: [bgStart],
        outputs: [scaled],
      })
      filters.push({
        filter: 'crop',
        options: { w: ctx.inputWidth, h: ctx.inputHeight, x: '(in_w-out_w)/2', y: '(in_h-out_h)/2' },
        inputs: [scaled],
        outputs: [bgLabel],
      })
    }

    if (blur > 0) {
      const blurred = `bg_blur_${key}`
      filters.push({
        filter: 'boxblur',
        options: { luma_radius: Math.max(1, Math.round(blur / 2)), luma_power: 1 },
        inputs: [bgLabel],
        outputs: [blurred],
      })
      bgLabel = blurred
    }

    const foregroundLabel = `fg_${key}`
    const targetW = Math.max(16, even((ctx.inputWidth * foregroundScale) / 100))
    const targetH = Math.max(16, even((ctx.inputHeight * foregroundScale) / 100))
    filters.push({
      filter: 'scale',
      options: { w: targetW, h: targetH, force_original_aspect_ratio: 'decrease' },
      inputs: ['0:v'],
      outputs: [foregroundLabel],
    })

    const { x, y } = resolveForegroundPosition(params.foregroundPosition, padding)
    filters.push({
      filter: 'overlay',
      options: { x, y },
      inputs: [bgLabel, foregroundLabel],
      outputs: [`out_${key}`],
    })

    return filters
  },

  validate(params) {
    if (!params.video) return 'Background video is required'
    return null
  },
}

export default backgroundVideo

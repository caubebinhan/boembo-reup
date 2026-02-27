/**
 * Plugin: Blur Region
 * ───────────────────
 * Blur specific rectangular regions of the video.
 * Multi-instance: user can blur multiple regions (faces, text, etc.).
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const blurRegion: VideoEditPlugin = {
  id: 'builtin.blur_region',
  name: 'Blur Region',
  group: 'filter',
  icon: '🔲',
  description: 'Blur or pixelate a rectangular region',
  allowMultipleInstances: true,
  addInstanceLabel: 'Add another blur region',

  configSchema: [
    {
      key: 'region',
      type: 'region',
      label: 'Region to blur',
      description: 'Draw a rectangle on the video preview to select region',
      required: true,
    },
    {
      key: 'mode',
      type: 'select',
      label: 'Blur mode',
      default: 'gaussian',
      options: [
        { value: 'gaussian', label: 'Gaussian blur', icon: '🌫️' },
        { value: 'pixelate', label: 'Pixelate (mosaic)', icon: '🟦' },
      ],
    },
    {
      key: 'intensity',
      type: 'slider',
      label: 'Blur intensity',
      default: 20,
      min: 5,
      max: 50,
      step: 5,
    },
    {
      key: 'timeRange',
      type: 'timeRange',
      label: 'Active during',
      description: 'Leave empty for entire video',
    },
  ],

  buildFilters(params, ctx) {
    const region = params.region
    if (!region || !region.w || !region.h) return []

    const key = ctx.instanceKey
    const mode = params.mode || 'gaussian'
    const intensity = params.intensity ?? 20
    const { x, y, w, h } = region

    const filters: FFmpegFilter[] = []

    // Enable expression for time range
    let enableExpr: string | undefined
    const start = params.timeRange?.start
    const end = params.timeRange?.end
    if (start != null || end != null) {
      const s = start ?? 0
      const e = end ?? ctx.inputDurationSec
      enableExpr = `between(t,${s},${e})`
    }

    if (mode === 'pixelate') {
      // Pixelate: crop → scale down → scale up → overlay
      filters.push({
        filter: 'crop',
        options: { w, h, x, y },
        inputs: ['0:v'],
        outputs: [`region_${key}`],
      })
      filters.push({
        filter: 'scale',
        options: { w: Math.max(4, Math.round(w / intensity)), h: Math.max(4, Math.round(h / intensity)) },
        inputs: [`region_${key}`],
        outputs: [`region_small_${key}`],
      })
      filters.push({
        filter: 'scale',
        options: { w, h },
        inputs: [`region_small_${key}`],
        outputs: [`region_pix_${key}`],
      })
      const overlayOpts: Record<string, any> = { x, y }
      if (enableExpr) overlayOpts.enable = enableExpr
      filters.push({
        filter: 'overlay',
        options: overlayOpts,
        inputs: ['0:v', `region_pix_${key}`],
        outputs: [`out_${key}`],
      })
    } else {
      // Gaussian: crop → blur → overlay
      filters.push({
        filter: 'crop',
        options: { w, h, x, y },
        inputs: ['0:v'],
        outputs: [`region_${key}`],
      })
      filters.push({
        filter: 'boxblur',
        options: { luma_radius: intensity, luma_power: 3 },
        inputs: [`region_${key}`],
        outputs: [`region_blur_${key}`],
      })
      const overlayOpts: Record<string, any> = { x, y }
      if (enableExpr) overlayOpts.enable = enableExpr
      filters.push({
        filter: 'overlay',
        options: overlayOpts,
        inputs: ['0:v', `region_blur_${key}`],
        outputs: [`out_${key}`],
      })
    }

    return filters
  },

  validate(params) {
    const r = params.region
    if (!r || !r.w || !r.h) return 'Select a region to blur'
    if (r.w < 10 || r.h < 10) return 'Region too small (minimum 10x10px)'
    return null
  },
}

export default blurRegion

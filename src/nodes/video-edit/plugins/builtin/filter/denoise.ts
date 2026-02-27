/**
 * Plugin: Denoise
 * ───────────────
 * Reduce video noise using FFmpeg hqdn3d or nlmeans filters.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const denoise: VideoEditPlugin = {
  id: 'builtin.denoise',
  name: 'Denoise',
  group: 'filter',
  icon: '✨',
  description: 'Reduce video noise for cleaner look',

  configSchema: [
    {
      key: 'strength',
      type: 'select',
      label: 'Strength',
      default: 'medium',
      options: [
        { value: 'light', label: 'Light', icon: '🌤️' },
        { value: 'medium', label: 'Medium', icon: '🌥️' },
        { value: 'strong', label: 'Strong', icon: '☁️' },
      ],
    },
    {
      key: 'method',
      type: 'select',
      label: 'Method',
      default: 'hqdn3d',
      options: [
        { value: 'hqdn3d', label: 'Fast (hqdn3d)' },
        { value: 'nlmeans', label: 'Quality (nlmeans — slower)' },
      ],
    },
  ],

  buildFilters(params) {
    const strength = params.strength || 'medium'
    const method = params.method || 'hqdn3d'
    const filters: FFmpegFilter[] = []

    if (method === 'nlmeans') {
      const NLMEANS_PRESETS: Record<string, Record<string, any>> = {
        light:  { s: 3, p: 3, r: 7 },
        medium: { s: 5, p: 5, r: 9 },
        strong: { s: 8, p: 7, r: 11 },
      }
      filters.push({
        filter: 'nlmeans',
        options: NLMEANS_PRESETS[strength] || NLMEANS_PRESETS.medium,
      })
    } else {
      const HQDN3D_PRESETS: Record<string, Record<string, any>> = {
        light:  { luma_spatial: 3, chroma_spatial: 2, luma_tmp: 3, chroma_tmp: 2 },
        medium: { luma_spatial: 5, chroma_spatial: 4, luma_tmp: 5, chroma_tmp: 4 },
        strong: { luma_spatial: 8, chroma_spatial: 6, luma_tmp: 8, chroma_tmp: 6 },
      }
      filters.push({
        filter: 'hqdn3d',
        options: HQDN3D_PRESETS[strength] || HQDN3D_PRESETS.medium,
      })
    }

    return filters
  },
}

export default denoise

/**
 * Plugin: Color Grading
 * Adjust brightness, contrast, saturation, gamma, and hue.
 * Uses FFmpeg eq and hue filters.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const colorGrade: VideoEditPlugin = {
  id: 'builtin.color_grade',
  name: 'Color Grading',
  group: 'filter',
  icon: 'palette',
  description: 'Adjust colors, brightness, contrast, saturation',

  configSchema: [
    {
      key: 'preset',
      type: 'select',
      label: 'Preset',
      default: 'custom',
      options: [
        { value: 'custom', label: 'Custom' },
        { value: 'warm', label: 'Warm' },
        { value: 'cool', label: 'Cool' },
        { value: 'vintage', label: 'Vintage' },
        { value: 'vivid', label: 'Vivid' },
        { value: 'desaturated', label: 'Desaturated' },
      ],
    },
    {
      key: 'brightness',
      type: 'slider',
      label: 'Brightness',
      default: 0,
      min: -0.5,
      max: 0.5,
      step: 0.05,
      condition: { field: 'preset', value: 'custom' },
    },
    {
      key: 'contrast',
      type: 'slider',
      label: 'Contrast',
      default: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.05,
      condition: { field: 'preset', value: 'custom' },
    },
    {
      key: 'saturation',
      type: 'slider',
      label: 'Saturation',
      default: 1.0,
      min: 0,
      max: 3.0,
      step: 0.1,
      condition: { field: 'preset', value: 'custom' },
    },
    {
      key: 'gamma',
      type: 'slider',
      label: 'Gamma',
      default: 1.0,
      min: 0.5,
      max: 2.5,
      step: 0.05,
      condition: { field: 'preset', value: 'custom' },
    },
    {
      key: 'hue',
      type: 'slider',
      label: 'Hue shift',
      default: 0,
      min: -180,
      max: 180,
      step: 5,
      unit: 'deg',
      condition: { field: 'preset', value: 'custom' },
    },
  ],

  buildFilters(params) {
    const p = resolvePreset(params)
    const filters: VideoFilter[] = []

    // Apply eq filter for brightness/contrast/saturation/gamma
    const hasEq = p.brightness !== 0 || p.contrast !== 1.0 || p.saturation !== 1.0 || p.gamma !== 1.0
    if (hasEq) {
      filters.push({
        filter: 'eq',
        options: {
          brightness: p.brightness,
          contrast: p.contrast,
          saturation: p.saturation,
          gamma: p.gamma,
        },
      })
    }

    // Apply hue filter
    if (p.hue !== 0) {
      filters.push({
        filter: 'hue',
        options: { h: p.hue },
      })
    }

    return filters
  },
}

interface ColorParams {
  brightness: number
  contrast: number
  saturation: number
  gamma: number
  hue: number
}

const PRESETS: Record<string, ColorParams> = {
  warm:        { brightness: 0.05, contrast: 1.05, saturation: 1.2, gamma: 1.0, hue: 15 },
  cool:        { brightness: 0, contrast: 1.0, saturation: 0.9, gamma: 1.05, hue: -20 },
  vintage:     { brightness: -0.05, contrast: 1.1, saturation: 0.7, gamma: 1.1, hue: 10 },
  vivid:       { brightness: 0.05, contrast: 1.15, saturation: 1.5, gamma: 0.95, hue: 0 },
  desaturated: { brightness: 0, contrast: 1.0, saturation: 0.3, gamma: 1.0, hue: 0 },
}

function resolvePreset(params: Record<string, any>): ColorParams {
  if (params.preset && params.preset !== 'custom' && PRESETS[params.preset]) {
    return PRESETS[params.preset]
  }
  return {
    brightness: params.brightness ?? 0,
    contrast: params.contrast ?? 1.0,
    saturation: params.saturation ?? 1.0,
    gamma: params.gamma ?? 1.0,
    hue: params.hue ?? 0,
  }
}

export default colorGrade

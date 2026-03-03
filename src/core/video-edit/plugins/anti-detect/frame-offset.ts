/**
 * Plugin: Frame Offset
 * Trims a few milliseconds from the start and/or end of the video.
 * Creates a unique start/end frame that differs from the original.
 * Default enabled for reup workflows.
 */
import type { VideoEditPlugin } from '@core/video-edit/types'

const frameOffset: VideoEditPlugin = {
  id: 'builtin.frame_offset',
  name: 'Trim First/Last Frame',
  group: 'anti-detect',
  icon: 'shift',
  description: 'Trim a small random portion from the start',
  defaultEnabled: false,
  warning: 'Removes 0.1-0.5s from the start of the video. May cut important intro content.',

  configSchema: [
    {
      key: 'trimStartMs',
      type: 'slider',
      label: 'Trim start (ms)',
      default: 100,
      min: 0,
      max: 500,
      step: 50,
      description: 'Milliseconds to trim from start',
    },
    {
      key: 'trimEndMs',
      type: 'slider',
      label: 'Trim end (ms)',
      default: 100,
      min: 0,
      max: 500,
      step: 50,
      description: 'Milliseconds to trim from end',
    },
  ],

  buildFilters(_params) {
    // Trim uses output options (-ss / -to), not filters
    return []
  },

  getOutputOptions(params) {
    const opts: string[] = []
    const trimStart = (params.trimStartMs ?? 100) / 1000
    const trimEnd = (params.trimEndMs ?? 100) / 1000

    if (trimStart > 0) {
      opts.push('-ss', String(trimStart))
    }
    // Note: trimEnd needs total duration, which is handled in pipeline
    // For now we store it; the pipeline will apply -to (duration - trimEnd)
    if (trimEnd > 0) {
      opts.push('-t_trim_end', String(trimEnd)) // custom marker, handled by pipeline
    }
    return opts
  },

  validate(params) {
    const start = params.trimStartMs ?? 0
    const end = params.trimEndMs ?? 0
    if (start < 0 || end < 0) return 'Trim values must be positive'
    if (start > 2000 || end > 2000) return 'Trim values too large (max 2000ms)'
    return null
  },
}

export default frameOffset

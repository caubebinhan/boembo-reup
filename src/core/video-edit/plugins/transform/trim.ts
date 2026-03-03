/**
 * Plugin: Trim / Cut
 * Trim video to keep or remove specific time ranges.
 * Uses -ss/-to for simple trims, multi-pass for segment cuts.
 */
import type { VideoEditPlugin } from '@core/video-edit/types'

const trim: VideoEditPlugin = {
  id: 'builtin.trim',
  name: 'Trim / Cut',
  group: 'transform',
  icon: 'cut',
  description: 'Trim video to specific time range or remove segments',

  configSchema: [
    {
      key: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'keep',
      options: [
        { value: 'keep', label: 'Keep (trim to range)' },
        { value: 'remove', label: 'Remove (cut out middle)' },
      ],
    },
    {
      key: 'startTime',
      type: 'time',
      label: 'Start time (seconds)',
      default: 0,
      min: 0,
      description: 'Start of the retained/removed segment',
    },
    {
      key: 'endTime',
      type: 'time',
      label: 'End time (seconds)',
      default: 0,
      min: 0,
      description: 'End of the retained/removed segment (0 = end of video)',
    },
  ],

  // Simple keep-mode uses output options (fast)
  get requiresMultiPass() { return false },

  buildFilters(params, ctx) {
    if (params.mode === 'remove') {
      // Remove mode: select everything EXCEPT the range
      const start = params.startTime ?? 0
      const end = params.endTime || ctx.inputDurationSec
      return [{
        filter: 'select',
        options: { expr: `lt(t\\,${start})+gt(t\\,${end})` },
      }, {
        filter: 'setpts',
        options: { expr: 'N/FRAME_RATE/TB' },
      }]
    }
    // keep mode handled via outputOptions
    return []
  },

  getOutputOptions(params) {
    if (params.mode !== 'keep') return []
    const opts: string[] = []
    const start = params.startTime ?? 0
    const end = params.endTime ?? 0
    if (start > 0) opts.push('-ss', String(start))
    if (end > 0) opts.push('-to', String(end))
    return opts
  },

  validate(params) {
    const start = params.startTime ?? 0
    const end = params.endTime ?? 0
    if (start < 0) return 'Start time must be positive'
    if (end < 0) return 'End time must be positive'
    if (end > 0 && end <= start) return 'End time must be after start time'
    return null
  },
}

export default trim

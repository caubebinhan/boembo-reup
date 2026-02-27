/**
 * Plugin: Mute Segments
 * ─────────────────────
 * Mute audio during specific time ranges.
 * Multi-instance: user can mute multiple segments.
 */
import type { VideoEditPlugin } from '@core/video-edit/types'

const muteSegment: VideoEditPlugin = {
  id: 'builtin.mute_segment',
  name: 'Mute Segments',
  group: 'audio',
  icon: '🔇',
  description: 'Mute audio during specific time ranges',
  allowMultipleInstances: true,
  addInstanceLabel: 'Add another muted segment',

  configSchema: [
    {
      key: 'timeRange',
      type: 'timeRange',
      label: 'Mute during',
      required: true,
      description: 'Time range to mute audio',
    },
  ],

  buildFilters(params, ctx) {
    const start = params.timeRange?.start ?? 0
    const end = params.timeRange?.end ?? ctx.inputDurationSec

    return [{
      filter: 'volume',
      options: {
        volume: 0,
        enable: `between(t,${start},${end})`,
      },
      inputs: ['0:a'],
      outputs: [`a_mute_${ctx.instanceKey}`],
    }]
  },

  validate(params) {
    if (!params.timeRange) return 'Select a time range to mute'
    if (params.timeRange.end <= params.timeRange.start) return 'End time must be after start time'
    return null
  },
}

export default muteSegment

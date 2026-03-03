/**
 * Plugin: Audio Fade
 * ──────────────────
 * Add fade in and/or fade out to audio track.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const audioFade: VideoEditPlugin = {
  id: 'builtin.audio_fade',
  name: 'Audio Fade',
  group: 'audio',
  icon: 'fade',
  description: 'Fade audio in/out for smooth transitions',

  configSchema: [
    {
      key: 'fadeIn',
      type: 'slider',
      label: 'Fade in duration',
      default: 1,
      min: 0,
      max: 10,
      step: 0.5,
      unit: 'sec',
    },
    {
      key: 'fadeOut',
      type: 'slider',
      label: 'Fade out duration',
      default: 1,
      min: 0,
      max: 10,
      step: 0.5,
      unit: 'sec',
    },
  ],

  buildFilters(params, ctx) {
    const fadeIn = params.fadeIn ?? 1
    const fadeOut = params.fadeOut ?? 1
    const filters: VideoFilter[] = []

    if (fadeIn > 0) {
      filters.push({
        filter: 'afade',
        options: { t: 'in', st: 0, d: fadeIn },
        inputs: ['0:a'],
        outputs: fadeOut > 0 ? ['a_fi'] : ['a_out'],
      })
    }

    if (fadeOut > 0) {
      const fadeOutStart = Math.max(0, ctx.inputDurationSec - fadeOut)
      filters.push({
        filter: 'afade',
        options: { t: 'out', st: fadeOutStart, d: fadeOut },
        inputs: fadeIn > 0 ? ['a_fi'] : ['0:a'],
        outputs: ['a_out'],
      })
    }

    return filters
  },
}

export default audioFade

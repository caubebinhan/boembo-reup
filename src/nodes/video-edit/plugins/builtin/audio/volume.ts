/**
 * Plugin: Volume Adjust
 * ─────────────────────
 * Adjust overall audio volume with optional loudness normalization.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const volume: VideoEditPlugin = {
  id: 'builtin.volume',
  name: 'Volume Adjust',
  group: 'audio',
  icon: '🔉',
  description: 'Adjust overall audio volume or normalize loudness',

  configSchema: [
    {
      key: 'volume',
      type: 'slider',
      label: 'Volume',
      default: 100,
      min: 0,
      max: 300,
      step: 5,
      unit: '%',
      description: '100% = original, 200% = double',
    },
    {
      key: 'normalize',
      type: 'boolean',
      label: 'Normalize loudness (EBU R128)',
      default: false,
      description: 'Auto-adjust to standard broadcast loudness (-14 LUFS)',
    },
  ],

  buildFilters(params) {
    const vol = (params.volume ?? 100) / 100
    const normalize = params.normalize ?? false
    const filters: FFmpegFilter[] = []

    if (normalize) {
      // EBU R128 loudness normalization
      filters.push({
        filter: 'loudnorm',
        options: { I: -14, TP: -1.5, LRA: 11 },
        inputs: ['0:a'],
        outputs: ['a_out'],
      })
    } else if (vol !== 1.0) {
      filters.push({
        filter: 'volume',
        options: { volume: vol },
        inputs: ['0:a'],
        outputs: ['a_out'],
      })
    }

    return filters
  },
}

export default volume

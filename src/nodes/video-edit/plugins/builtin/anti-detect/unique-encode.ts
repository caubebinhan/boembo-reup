/**
 * Plugin: Unique Encode
 * ─────────────────────
 * Re-encodes video with slightly altered parameters to create a unique file hash.
 * Adds optional noise grain to further differentiate the video fingerprint.
 * Default enabled for reup workflows.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const uniqueEncode: VideoEditPlugin = {
  id: 'builtin.unique_encode',
  name: 'Re-encode Unique',
  group: 'anti-detect',
  icon: '🔀',
  description: 'Re-encode with unique parameters to change file fingerprint',
  defaultEnabled: true,

  configSchema: [
    {
      key: 'preset',
      type: 'select',
      label: 'Quality preset',
      default: 'balanced',
      options: [
        { value: 'fast', label: 'Fast (lower quality)' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'quality', label: 'Quality (slower)' },
      ],
    },
    {
      key: 'crfOffset',
      type: 'slider',
      label: 'CRF offset',
      default: 2,
      min: 0,
      max: 6,
      step: 1,
      description: 'Higher = more compression difference from original (±N from base CRF)',
    },
    {
      key: 'addNoise',
      type: 'boolean',
      label: 'Add subtle noise',
      default: true,
      description: 'Add imperceptible grain noise to change pixel data',
    },
    {
      key: 'noiseStrength',
      type: 'slider',
      label: 'Noise strength',
      default: 1,
      min: 1,
      max: 5,
      step: 1,
      description: 'Grain intensity (1=barely visible, 5=noticeable)',
      condition: { field: 'addNoise', value: true },
    },
  ],

  buildFilters(params) {
    const filters: FFmpegFilter[] = []

    if (params.addNoise) {
      const strength = params.noiseStrength ?? 1
      // noise filter: add Gaussian noise
      filters.push({
        filter: 'noise',
        options: {
          alls: strength,        // strength for all components
          allf: 't',             // temporal noise (varies per frame)
        },
      })
    }

    return filters
  },

  getOutputOptions(params) {
    const preset = params.preset === 'fast' ? 'veryfast'
      : params.preset === 'quality' ? 'slow'
        : 'medium'

    // Randomize CRF slightly around base 23
    const baseCrf = 23
    const offset = params.crfOffset ?? 2
    // Random direction: ±offset (deterministic per-video would be better, but this is fine)
    const crf = baseCrf + (Math.random() > 0.5 ? offset : -offset)

    return [
      '-c:v', 'libx264',
      '-crf', String(Math.max(18, Math.min(28, crf))),
      '-preset', preset,
    ]
  },
}

export default uniqueEncode

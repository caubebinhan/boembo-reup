/**
 * Plugin: PRNU Destroy
 * ────────────────────
 * Destroys PRNU (Photo-Response Non-Uniformity) sensor noise fingerprint.
 *
 * Theory: PRNU is a fixed-pattern noise from camera sensor manufacturing defects.
 * It acts as a "ballistic fingerprint" linking video to a specific device.
 * Platforms can use PRNU to verify if video was recorded natively vs uploaded.
 *
 * Strategy:
 *   1. Low-pass denoise to strip high-frequency PRNU noise
 *   2. Apply synthetic film grain to create fake PRNU pattern
 *   3. Result: forensic PRNU correlation (PCE) drops below detection threshold
 *
 * Default enabled — invisible to human eye, destroys forensic evidence.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const prnuDestroy: VideoEditPlugin = {
  id: 'builtin.prnu_destroy',
  name: 'PRNU Destroy',
  group: 'anti-detect',
  icon: '🔬',
  description: 'Remove PRNU sensor fingerprint + add synthetic grain',
  defaultEnabled: true,
  recommended: true,

  configSchema: [
    {
      key: 'denoiseStrength',
      type: 'select',
      label: 'Denoise level',
      default: 'medium',
      options: [
        { value: 'light', label: 'Light — fast, less thorough' },
        { value: 'medium', label: 'Medium — balanced' },
        { value: 'strong', label: 'Strong — slower, thorough PRNU removal' },
      ],
    },
    {
      key: 'grainType',
      type: 'select',
      label: 'Synthetic grain type',
      default: 'film',
      options: [
        { value: 'film', label: '🎬 Film grain — aesthetic, hides denoise artifacts' },
        { value: 'digital', label: '📱 Digital noise — realistic camera noise' },
        { value: 'none', label: '❌ None — denoise only (may look too clean)' },
      ],
    },
    {
      key: 'grainIntensity',
      type: 'slider',
      label: 'Grain intensity',
      default: 5,
      min: 1,
      max: 15,
      step: 1,
      description: '1–5 = subtle (invisible), 6–10 = visible aesthetic grain, 11–15 = heavy',
      condition: { field: 'grainType', value: 'film' },
    },
    {
      key: 'grainIntensity',
      type: 'slider',
      label: 'Noise intensity',
      default: 3,
      min: 1,
      max: 10,
      step: 1,
      condition: { field: 'grainType', value: 'digital' },
    },
  ],

  buildFilters(params, ctx) {
    const strength = params.denoiseStrength || 'medium'
    const grainType = params.grainType || 'film'
    const grainIntensity = params.grainIntensity ?? (grainType === 'film' ? 5 : 3)
    const key = ctx.instanceKey
    const filters: FFmpegFilter[] = []

    // Step 1: Denoise — strip PRNU high-frequency noise
    const DENOISE_PARAMS: Record<string, Record<string, any>> = {
      light:  { luma_spatial: 3, chroma_spatial: 2, luma_tmp: 4, chroma_tmp: 3 },
      medium: { luma_spatial: 5, chroma_spatial: 4, luma_tmp: 6, chroma_tmp: 5 },
      strong: { luma_spatial: 8, chroma_spatial: 6, luma_tmp: 8, chroma_tmp: 6 },
    }

    filters.push({
      filter: 'hqdn3d',
      options: DENOISE_PARAMS[strength] || DENOISE_PARAMS.medium,
      outputs: [`dn_${key}`],
    })

    // Step 2: Add synthetic grain (creates fake PRNU, hides denoise artifacts)
    if (grainType === 'film') {
      // Film grain: temporal noise with slight chroma variation
      filters.push({
        filter: 'noise',
        options: {
          c0s: grainIntensity,
          c1s: Math.max(1, Math.floor(grainIntensity * 0.4)),
          allf: 't',          // temporal (varies per frame)
        },
        inputs: [`dn_${key}`],
        outputs: [`out_${key}`],
      })
    } else if (grainType === 'digital') {
      // Digital sensor noise: uniform across channels
      filters.push({
        filter: 'noise',
        options: {
          alls: grainIntensity,
          allf: 't+u',        // temporal + uniform distribution
        },
        inputs: [`dn_${key}`],
        outputs: [`out_${key}`],
      })
    }
    // grainType === 'none' → denoise only, no grain added

    return filters
  },
}

export default prnuDestroy

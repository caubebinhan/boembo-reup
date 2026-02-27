/**
 * Plugin: Change Speed
 * ────────────────────
 * Speed up or slow down video. Supports pitch preservation for audio.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const speed: VideoEditPlugin = {
  id: 'builtin.speed',
  name: 'Change Speed',
  group: 'transform',
  icon: '⚡',
  description: 'Speed up or slow down video playback',

  configSchema: [
    {
      key: 'speed',
      type: 'slider',
      label: 'Speed multiplier',
      default: 1.0,
      min: 0.25,
      max: 4.0,
      step: 0.25,
      description: '1.0 = normal, 2.0 = double speed, 0.5 = half speed',
    },
    {
      key: 'preservePitch',
      type: 'boolean',
      label: 'Preserve audio pitch',
      default: true,
      description: 'Keep original pitch when changing speed (no chipmunk effect)',
    },
  ],

  buildFilters(params, ctx) {
    const spd = params.speed ?? 1.0
    if (spd === 1.0) return [] // no change

    const filters: FFmpegFilter[] = []

    // Video: setpts to change playback speed
    // PTS/speed: >1 = faster, <1 = slower
    filters.push({
      filter: 'setpts',
      options: { expr: `PTS/${spd}` },
      inputs: ['0:v'],
      outputs: ['v_speed'],
    })

    // Audio: atempo (only supports 0.5-2.0 range, chain for wider range)
    if (ctx.inputDurationSec > 0) {
      const atempoFilters = buildAtempoChain(spd, ctx)
      filters.push(...atempoFilters)
    }

    return filters
  },
}

/**
 * Build atempo filter chain.
 * atempo only supports 0.5-2.0 range, so we chain multiple for extreme speeds.
 */
function buildAtempoChain(
  speed: number,
  ctx: { inputDurationSec: number },
): FFmpegFilter[] {
  if (!ctx.inputDurationSec) return []

  const filters: FFmpegFilter[] = []
  let remaining = speed
  let inputPad = '0:a'
  let idx = 0

  while (remaining > 2.0 || remaining < 0.5) {
    const tempo = remaining > 2.0 ? 2.0 : 0.5
    const outputPad = `a_tempo${idx}`
    filters.push({
      filter: 'atempo',
      options: { tempo },
      inputs: [inputPad],
      outputs: [outputPad],
    })
    remaining = remaining / tempo
    inputPad = outputPad
    idx++
  }

  // Final atempo with remaining value
  filters.push({
    filter: 'atempo',
    options: { tempo: Math.round(remaining * 1000) / 1000 },
    inputs: [inputPad],
    outputs: ['a_out'],
  })

  return filters
}

export default speed

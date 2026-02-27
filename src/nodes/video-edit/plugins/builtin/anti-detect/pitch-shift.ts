/**
 * Plugin: Audio Pitch Shift
 * ─────────────────────────
 * Shifts audio pitch to evade audio fingerprinting (AFP) systems.
 *
 * Theory: Audio fingerprinting (Shazam/Content ID) relies on spectral peaks
 * in time-frequency spectrograms. Pitch shifting displaces all frequency data
 * linearly or non-linearly along the frequency axis, breaking MFCC-based
 * recognition. Combined with EQ band filtering, the original spectral
 * fingerprint becomes unrecognizable.
 *
 * Strategy:
 *   1. asetrate: change sample rate to shift pitch (without changing speed)
 *   2. aresample: resample back to standard rate
 *   3. atempo: compensate speed change to maintain original duration
 *   4. highpass + lowpass: remove extreme frequencies that carry signature data
 *   5. Optional: add ambient noise layer for "audio sandwich"
 *
 * Default enabled — the #1 reason videos get flagged is audio matching.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const pitchShift: VideoEditPlugin = {
  id: 'builtin.pitch_shift',
  name: 'Audio Anti-Fingerprint',
  group: 'anti-detect',
  icon: '🎵',
  description: 'Shift audio pitch + EQ filtering to evade audio fingerprinting',
  defaultEnabled: true,
  warning: '⚠️ Alters original audio. Pitch shift may be noticeable on speech/music. Use with caution.',

  configSchema: [
    {
      key: 'shiftSemitones',
      type: 'slider',
      label: 'Pitch shift',
      default: 1,
      min: -3,
      max: 3,
      step: 0.5,
      unit: 'semitones',
      description: 'Positive = higher pitch, Negative = lower. 1-2 semitones recommended.',
    },
    {
      key: 'applyEQ',
      type: 'boolean',
      label: 'Apply frequency masking (EQ)',
      default: true,
      description: 'Cut extreme frequencies that carry fingerprint signature data',
    },
    {
      key: 'eqHighpass',
      type: 'slider',
      label: 'Highpass (cut low frequencies)',
      default: 80,
      min: 20,
      max: 300,
      step: 10,
      unit: 'Hz',
      description: 'Remove sub-bass rumble and low-frequency signatures',
      condition: { field: 'applyEQ', value: true },
    },
    {
      key: 'eqLowpass',
      type: 'slider',
      label: 'Lowpass (cut high frequencies)',
      default: 14000,
      min: 5000,
      max: 20000,
      step: 500,
      unit: 'Hz',
      description: 'Remove high-frequency harmonics. Lower = more aggressive masking.',
      condition: { field: 'applyEQ', value: true },
    },
    {
      key: 'addAmbient',
      type: 'boolean',
      label: 'Add ambient noise layer',
      default: false,
      description: 'Mix subtle background noise to mask remaining fingerprint features',
    },
    {
      key: 'ambientLevel',
      type: 'slider',
      label: 'Ambient noise level',
      default: -30,
      min: -40,
      max: -15,
      step: 1,
      unit: 'dB',
      description: 'Lower = more subtle. -30dB is barely audible.',
      condition: { field: 'addAmbient', value: true },
    },
  ],

  buildFilters(params, ctx) {
    const semitones = params.shiftSemitones ?? 1
    const applyEQ = params.applyEQ ?? true
    const key = ctx.instanceKey
    const filters: FFmpegFilter[] = []

    if (semitones === 0 && !applyEQ && !params.addAmbient) return []

    // Step 1: Pitch shift using asetrate → aresample → atempo compensation
    // Pitch ratio: 2^(semitones/12)
    if (semitones !== 0) {
      const pitchRatio = Math.pow(2, semitones / 12)
      const targetRate = Math.round(44100 * pitchRatio)
      const tempoCompensation = 1 / pitchRatio // compensate speed change

      filters.push({
        filter: 'asetrate',
        options: { r: targetRate },
        inputs: ['0:a'],
        outputs: [`a_rate_${key}`],
      }, {
        filter: 'aresample',
        options: { sample_rate: 44100 },
        inputs: [`a_rate_${key}`],
        outputs: [`a_resamp_${key}`],
      })

      // Compensate tempo (atempo only supports 0.5-2.0, chain if needed)
      const atempoFilters = buildAtempoChain(tempoCompensation, `a_resamp_${key}`, `a_pitch_${key}`, key)
      filters.push(...atempoFilters)
    }

    const prevLabel = semitones !== 0 ? `a_pitch_${key}` : '0:a'

    // Step 2: EQ band filtering
    if (applyEQ) {
      const hp = params.eqHighpass ?? 80
      const lp = params.eqLowpass ?? 14000
      let currentLabel = prevLabel

      filters.push({
        filter: 'highpass',
        options: { f: hp, poles: 2 },
        inputs: [currentLabel],
        outputs: [`a_hp_${key}`],
      }, {
        filter: 'lowpass',
        options: { f: lp, poles: 2 },
        inputs: [`a_hp_${key}`],
        outputs: [`a_eq_${key}`],
      })
    }

    const eqLabel = applyEQ ? `a_eq_${key}` : prevLabel

    // Step 3: Ambient noise layer (audio sandwich)
    if (params.addAmbient) {
      const noiseLevel = params.ambientLevel ?? -30
      // Generate pink noise at specified level
      filters.push({
        filter: 'anoisesrc',
        options: {
          color: 'pink',
          duration: ctx.inputDurationSec,
          amplitude: Math.pow(10, noiseLevel / 20), // dB to amplitude
        },
        inputs: [],
        outputs: [`noise_${key}`],
      })

      filters.push({
        filter: 'amix',
        options: { inputs: 2, duration: 'first', dropout_transition: 0 },
        inputs: [eqLabel, `noise_${key}`],
        outputs: [`a_out_${key}`],
      })
    }

    return filters
  },

  validate(params) {
    const semitones = params.shiftSemitones ?? 0
    if (Math.abs(semitones) > 5) return 'Pitch shift too extreme (max ±5 semitones)'
    return null
  },
}

/**
 * Build atempo filter chain (supports 0.5-2.0 range, chains for wider range)
 */
function buildAtempoChain(
  tempo: number,
  inputLabel: string,
  outputLabel: string,
  key: string,
): FFmpegFilter[] {
  const filters: FFmpegFilter[] = []
  let remaining = tempo
  let currentInput = inputLabel
  let idx = 0

  const CLAMP_MIN = 0.5
  const CLAMP_MAX = 2
  while (remaining > CLAMP_MAX || remaining < CLAMP_MIN) {
    const t = remaining > CLAMP_MAX ? CLAMP_MAX : CLAMP_MIN
    const outLabel = `atempo_${key}_${idx}`
    filters.push({
      filter: 'atempo',
      options: { tempo: t },
      inputs: [currentInput],
      outputs: [outLabel],
    })
    remaining /= t
    currentInput = outLabel
    idx++
  }

  filters.push({
    filter: 'atempo',
    options: { tempo: Math.round(remaining * 10000) / 10000 },
    inputs: [currentInput],
    outputs: [outputLabel],
  })

  return filters
}

export default pitchShift

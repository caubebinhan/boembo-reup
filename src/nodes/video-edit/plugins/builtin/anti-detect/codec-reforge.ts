/**
 * Plugin: Codec Reforge
 * ─────────────────────
 * Defeats codec forensics and motion vector analysis.
 *
 * Theory: Videos compressed with H.264/H.265 contain motion vectors (MV),
 * macroblock structures, and quantization artifacts unique to each encode.
 * Forensic tools detect double MPEG compression and analyze GOP (Group of
 * Pictures) structure to link reposted videos to originals.
 *
 * Strategy:
 *   1. Re-encode with completely new GOP structure (keyframe interval)
 *   2. Change resolution slightly to force motion vector re-interpolation
 *   3. Use different encoder preset to alter macroblock decisions
 *   4. Randomize bitrate/CRF to create unique quantization artifacts
 *
 * This goes beyond basic re-encoding by ensuring codec-level forensic
 * analysis cannot correlate the output with ANY known original.
 */
import type { VideoEditPlugin } from '@core/video-edit/types'

const codecReforge: VideoEditPlugin = {
  id: 'builtin.codec_reforge',
  name: 'Codec Reforge',
  group: 'anti-detect',
  icon: '⚙️',
  description: 'Destroy codec fingerprint — new GOP, motion vectors, quantization',
  defaultEnabled: true,

  configSchema: [
    {
      key: 'scalePercent',
      type: 'slider',
      label: 'Scale shift',
      default: 2,
      min: 0,
      max: 8,
      step: 1,
      unit: '%',
      description: 'Scale video by ±N% — forces complete MV re-interpolation. 0 = no scale.',
    },
    {
      key: 'gopSize',
      type: 'select',
      label: 'GOP (keyframe interval)',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto — randomize between 48-120' },
        { value: '48', label: '48 frames (2 sec @ 24fps)' },
        { value: '72', label: '72 frames (3 sec @ 24fps)' },
        { value: '120', label: '120 frames (5 sec @ 24fps)' },
        { value: '240', label: '240 frames (10 sec @ 24fps)' },
      ],
    },
    {
      key: 'qualityMode',
      type: 'select',
      label: 'Quality mode',
      default: 'crf',
      options: [
        { value: 'crf', label: 'CRF — constant quality (recommended)' },
        { value: 'cbr', label: 'CBR — constant bitrate (different quantization pattern)' },
      ],
    },
    {
      key: 'crfValue',
      type: 'slider',
      label: 'CRF value',
      default: 21,
      min: 18,
      max: 28,
      step: 1,
      description: 'Lower = better quality + larger file. 18-22 recommended.',
      condition: { field: 'qualityMode', value: 'crf' },
    },
    {
      key: 'bitrateKbps',
      type: 'slider',
      label: 'Bitrate',
      default: 5000,
      min: 2000,
      max: 15000,
      step: 500,
      unit: 'kbps',
      condition: { field: 'qualityMode', value: 'cbr' },
    },
  ],

  buildFilters(params, ctx) {
    const scalePercent = params.scalePercent ?? 2
    if (scalePercent === 0) return []

    const key = ctx.instanceKey
    // Scale slightly to force motion vector re-computation
    // Randomize direction (up or down) for unpredictability
    const direction = Math.random() > 0.5 ? 1 : -1
    const factor = 1 + (direction * scalePercent / 100)
    const newW = Math.round(ctx.inputWidth * factor / 2) * 2  // ensure even
    const newH = Math.round(ctx.inputHeight * factor / 2) * 2

    return [{
      filter: 'scale',
      options: { w: newW, h: newH },
      outputs: [`sc_${key}`],
    }, {
      // Scale back to original dimensions
      filter: 'scale',
      options: { w: ctx.inputWidth, h: ctx.inputHeight },
      inputs: [`sc_${key}`],
      outputs: [`out_${key}`],
    }]
  },

  getOutputOptions(params) {
    const gopSize = resolveGop(params.gopSize)
    const opts: string[] = [
      '-c:v', 'libx264',
      '-g', String(gopSize),    // keyframe interval
      '-bf', '2',               // B-frames
      '-refs', '4',             // reference frames
    ]

    if (params.qualityMode === 'cbr') {
      const bitrate = params.bitrateKbps ?? 5000
      opts.push('-b:v', `${bitrate}k`, '-maxrate', `${bitrate * 1.1}k`, '-bufsize', `${bitrate * 2}k`)
    } else {
      const crf = (params.crfValue ?? 21) + randomInt(-1, 1)
      opts.push('-crf', String(Math.max(18, Math.min(28, crf))))
    }

    // Different preset from original for different macroblock decisions
    const presets = ['medium', 'slow', 'fast']
    opts.push('-preset', presets[Math.floor(Math.random() * presets.length)])

    return opts
  },
}

function resolveGop(gopOption: string): number {
  if (gopOption === 'auto' || !gopOption) {
    return 48 + Math.floor(Math.random() * 72) // Random 48-120
  }
  return Number(gopOption) || 72
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export default codecReforge

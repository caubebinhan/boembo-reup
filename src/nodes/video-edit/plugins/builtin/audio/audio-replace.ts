/**
 * Plugin: Replace Audio
 * ─────────────────────
 * Replace or mix a new audio track with the original video audio.
 * Multi-pass plugin (requires separate FFmpeg command for audio mixing).
 */
import type { VideoEditPlugin, FFmpegFilter, FFmpegCommand } from '@core/video-edit/types'

const audioReplace: VideoEditPlugin = {
  id: 'builtin.audio_replace',
  name: 'Replace Audio',
  group: 'audio',
  icon: '🎵',
  description: 'Replace or mix audio with a new track',
  requiresMultiPass: true,

  configSchema: [
    {
      key: 'audioFile',
      type: 'asset',
      label: 'Audio file',
      description: 'MP3, WAV, AAC, etc.',
      required: true,
    },
    {
      key: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'replace',
      options: [
        { value: 'replace', label: 'Replace original audio' },
        { value: 'mix', label: 'Mix with original audio' },
      ],
    },
    {
      key: 'originalVolume',
      type: 'slider',
      label: 'Original audio volume',
      default: 0.3,
      min: 0,
      max: 1.0,
      step: 0.1,
      condition: { field: 'mode', value: 'mix' },
    },
    {
      key: 'newVolume',
      type: 'slider',
      label: 'New audio volume',
      default: 1.0,
      min: 0.1,
      max: 2.0,
      step: 0.1,
    },
    {
      key: 'loop',
      type: 'boolean',
      label: 'Loop audio to match video length',
      default: true,
    },
    {
      key: 'startOffset',
      type: 'time',
      label: 'Start offset',
      default: 0,
      description: 'Start audio from this point (seconds)',
    },
  ],

  buildFilters() {
    // Multi-pass only
    return []
  },

  buildMultiPassCommands(params, ctx) {
    const audioPath = ctx.assetResolver(params.audioFile)
    if (!audioPath) return []

    const mode = params.mode || 'replace'
    const newVol = params.newVolume ?? 1.0
    const loop = params.loop ?? true
    const offset = params.startOffset ?? 0

    const inputOptions: string[] = []
    if (loop) inputOptions.push('-stream_loop', '-1')
    if (offset > 0) inputOptions.push('-ss', String(offset))

    const commands: FFmpegCommand[] = []

    if (mode === 'replace') {
      // Simple replace: take video from input 0, audio from input 1
      commands.push({
        inputs: [{ path: audioPath, options: inputOptions }],
        filters: newVol !== 1.0
          ? [{ filter: 'volume', options: { volume: newVol }, inputs: ['1:a'], outputs: ['a_out'] }]
          : [],
        outputOptions: {
          '-map': '0:v',
          '-map_audio': newVol !== 1.0 ? '[a_out]' : '1:a',
          '-shortest': '',
        },
      })
    } else {
      // Mix mode: merge both audio tracks
      const origVol = params.originalVolume ?? 0.3
      const filters: FFmpegFilter[] = [
        { filter: 'volume', options: { volume: origVol }, inputs: ['0:a'], outputs: ['a_orig'] },
        { filter: 'volume', options: { volume: newVol }, inputs: ['1:a'], outputs: ['a_new'] },
        { filter: 'amix', options: { inputs: 2, duration: 'first' }, inputs: ['a_orig', 'a_new'], outputs: ['a_out'] },
      ]
      commands.push({
        inputs: [{ path: audioPath, options: inputOptions }],
        filters,
        outputOptions: {},
      })
    }

    return commands
  },

  validate(params) {
    if (!params.audioFile) return 'Audio file is required'
    return null
  },
}

export default audioReplace

/**
 * Plugin: Frame Decimate
 * ──────────────────────
 * Randomly removes frames to break temporal consistency matching.
 *
 * Theory: Temporal consistency algorithms (TMK+PDQF, vPDQ) aggregate frame
 * hashes over time to create a 256KB video signature. By decimating (removing)
 * periodic frames, the temporal sequence is disrupted, causing signature
 * mismatch. Combined with slight FPS changes, the algorithm cannot align
 * the frame sequence to the original.
 *
 * Strategy:
 *   1. decimate: remove 1 in N duplicate/similar frames
 *   2. fps: change to a slightly different frame rate
 *   3. setpts: recalculate presentation timestamps
 *
 * Default enabled — imperceptible to human eye if motion interpolation is good.
 */
import type { VideoEditPlugin, FFmpegFilter } from '@core/video-edit/types'

const frameDecimate: VideoEditPlugin = {
  id: 'builtin.frame_decimate',
  name: 'Temporal Disruption',
  group: 'anti-detect',
  icon: '🎞️',
  description: 'Break temporal hash matching via frame decimation + FPS shift',
  defaultEnabled: true,

  configSchema: [
    {
      key: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'decimate',
      options: [
        { value: 'decimate', label: 'Decimate — remove 1 in N frames' },
        { value: 'fps_shift', label: 'FPS shift — change frame rate' },
        { value: 'both', label: 'Both — maximum disruption' },
      ],
    },
    {
      key: 'decimateCycle',
      type: 'slider',
      label: 'Decimate cycle',
      default: 5,
      min: 3,
      max: 10,
      step: 1,
      description: 'Remove 1 frame every N frames (5 = remove 20% of frames)',
      condition: { field: 'mode', value: 'decimate' },
    },
    {
      key: 'decimateCycle',
      type: 'slider',
      label: 'Decimate cycle',
      default: 5,
      min: 3,
      max: 10,
      step: 1,
      condition: { field: 'mode', value: 'both' },
    },
    {
      key: 'targetFps',
      type: 'select',
      label: 'Target FPS',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto (shift ±2 fps from original)' },
        { value: '24', label: '24 fps (cinematic)' },
        { value: '25', label: '25 fps (PAL)' },
        { value: '29.97', label: '29.97 fps (NTSC)' },
        { value: '30', label: '30 fps' },
      ],
      condition: { field: 'mode', value: 'fps_shift' },
    },
    {
      key: 'targetFps',
      type: 'select',
      label: 'Target FPS',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto (shift ±2 fps)' },
        { value: '24', label: '24 fps' },
        { value: '25', label: '25 fps' },
        { value: '30', label: '30 fps' },
      ],
      condition: { field: 'mode', value: 'both' },
    },
  ],

  buildFilters(params, ctx) {
    const mode = params.mode || 'decimate'
    const key = ctx.instanceKey
    const filters: FFmpegFilter[] = []

    const useDecimate = mode === 'decimate' || mode === 'both'
    const useFps = mode === 'fps_shift' || mode === 'both'

    // Step 1: Decimate — remove periodic frames
    if (useDecimate) {
      const cycle = params.decimateCycle ?? 5
      filters.push({
        filter: 'decimate',
        options: { cycle },
        outputs: [`dec_${key}`],
      })
    }

    const prevLabel = useDecimate ? `dec_${key}` : undefined

    // Step 2: FPS shift — change frame rate
    if (useFps) {
      const targetFps = resolveTargetFps(params.targetFps, ctx.inputFps)
      filters.push({
        filter: 'fps',
        options: { fps: targetFps },
        inputs: prevLabel ? [prevLabel] : undefined,
        outputs: [`fps_${key}`],
      })

      // Recalculate timestamps
      filters.push({
        filter: 'setpts',
        options: { expr: 'N/FRAME_RATE/TB' },
        inputs: [`fps_${key}`],
        outputs: [`out_${key}`],
      })
    } else if (useDecimate) {
      // After decimate, fix timestamps
      filters.push({
        filter: 'setpts',
        options: { expr: 'N/FRAME_RATE/TB' },
        inputs: [`dec_${key}`],
        outputs: [`out_${key}`],
      })
    }

    return filters
  },
}

function resolveTargetFps(target: string, originalFps: number): number {
  if (target === 'auto' || !target) {
    // Shift by ±2 fps, picking whichever is a common rate
    const COMMON_FPS = [23.976, 24, 25, 29.97, 30]
    const shifted = COMMON_FPS.filter((f) => Math.abs(f - originalFps) >= 1 && Math.abs(f - originalFps) <= 6)
    return shifted.length > 0 ? shifted[0] : Math.max(24, originalFps - 2)
  }
  return Number(target) || 30
}

export default frameDecimate

/**
 * Plugin: Rotate / Flip
 * ─────────────────────
 * Rotate video by 90/180/270 degrees or flip horizontally/vertically.
 */
import type { VideoEditPlugin, VideoFilter } from '../../types'

const rotate: VideoEditPlugin = {
  id: 'builtin.rotate',
  name: 'Rotate / Flip',
  group: 'transform',
  icon: 'rotate',
  description: 'Rotate or flip the video',

  configSchema: [
    {
      key: 'angle',
      type: 'select',
      label: 'Rotation angle',
      default: '0',
      options: [
        { value: '0', label: 'No rotation' },
        { value: '90', label: '90° clockwise' },
        { value: '180', label: '180°' },
        { value: '270', label: '270° clockwise (90° counter-clockwise)' },
      ],
    },
    {
      key: 'flip',
      type: 'select',
      label: 'Flip',
      default: 'none',
      options: [
        { value: 'none', label: 'No flip' },
        { value: 'h', label: 'Horizontal' },
        { value: 'v', label: 'Vertical' },
        { value: 'both', label: 'Both' },
      ],
    },
  ],

  buildFilters(params) {
    const filters: VideoFilter[] = []
    const angle = params.angle || '0'
    const flip = params.flip || 'none'

    // Rotation
    switch (angle) {
      case '90':
        filters.push({ filter: 'transpose', options: { dir: 1 } }) // clockwise
        break
      case '180':
        filters.push({ filter: 'transpose', options: { dir: 1 } })
        filters.push({ filter: 'transpose', options: { dir: 1 } })
        break
      case '270':
        filters.push({ filter: 'transpose', options: { dir: 2 } }) // counter-clockwise
        break
    }

    // Flip
    if (flip === 'h' || flip === 'both') {
      filters.push({ filter: 'hflip', options: {} })
    }
    if (flip === 'v' || flip === 'both') {
      filters.push({ filter: 'vflip', options: {} })
    }

    return filters
  },
}

export default rotate

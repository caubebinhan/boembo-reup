/**
 * Plugin: Metadata Strip
 * Strips all metadata from video file to avoid fingerprinting.
 * Default enabled for reup workflows.
 */
import type { VideoEditPlugin } from '@core/video-edit/types'

const metadataStrip: VideoEditPlugin = {
  id: 'builtin.metadata_strip',
  name: 'Strip Metadata',
  group: 'anti-detect',
  icon: 'shield',
  description: 'Remove all metadata (EXIF, creation time, GPS, etc.)',
  defaultEnabled: true,
  recommended: true,

  configSchema: [
    {
      key: 'stripAll',
      type: 'boolean',
      label: 'Strip all metadata',
      default: true,
      description: 'Remove all metadata including format-specific tags',
    },
  ],

  buildFilters(_params) {
    // Metadata stripping uses output options, not filters
    return []
  },

  getOutputOptions(params) {
    const opts: string[] = ['-map_metadata', '-1']
    if (params.stripAll) {
      opts.push(
        '-fflags', '+bitexact',
        '-flags:v', '+bitexact',
        '-flags:a', '+bitexact',
      )
    }
    return opts
  },
}

export default metadataStrip

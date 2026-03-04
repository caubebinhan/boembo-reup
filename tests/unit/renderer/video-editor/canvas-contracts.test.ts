import { describe, expect, it } from 'vitest'
import { resolveCanvasRect } from '../../../../src/renderer/components/video-editor/canvas-contracts'
import type { PluginMeta, VideoEditOperation } from '../../../../src/renderer/components/video-editor/types'

const overlayImagePlugin: PluginMeta = {
  id: 'builtin.watermark_image',
  name: 'Image Watermark',
  group: 'overlay',
  icon: 'image',
  description: 'test',
  version: '1.0.0',
  source: 'builtin',
  previewHint: 'overlay-image',
  configSchema: [],
}

function buildOperation(params: Record<string, any>): VideoEditOperation {
  return {
    id: 'op1',
    pluginId: 'builtin.watermark_image',
    enabled: true,
    order: 0,
    params,
  }
}

describe('canvas-contracts overlay image mapping', () => {
  it('resolves height from image aspect ratio when aspect lock is enabled', () => {
    const rect = resolveCanvasRect(
      buildOperation({
        position: 'center',
        size: 30,
        keepAspectRatio: true,
        imageAspect: 2,
      }),
      overlayImagePlugin,
      null,
    )

    expect(rect?.w).toBeCloseTo(30, 3)
    expect(rect?.h).toBeCloseTo(15, 3)
  })

  it('uses explicit overlaySize height when aspect lock is disabled', () => {
    const rect = resolveCanvasRect(
      buildOperation({
        position: 'center',
        overlaySize: { w: 30, h: 45 },
        keepAspectRatio: false,
        imageAspect: 2,
      }),
      overlayImagePlugin,
      null,
    )

    expect(rect?.w).toBeCloseTo(30, 3)
    expect(rect?.h).toBeCloseTo(45, 3)
  })
})

import { describe, expect, it } from 'vitest'
import {
  resolveCanvasRect,
  resolveCanvasSpace,
  resolveTimelineCropSpace,
} from '../../../../src/renderer/components/video-editor/canvas-contracts'
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

const cropPlugin: PluginMeta = {
  id: 'builtin.crop',
  name: 'Smart Crop',
  group: 'transform',
  icon: 'crop',
  description: 'test',
  version: '1.0.0',
  source: 'builtin',
  previewHint: 'crop-guide',
  configSchema: [],
}

const overlayTextPlugin: PluginMeta = {
  id: 'builtin.watermark_text',
  name: 'Text Watermark',
  group: 'overlay',
  icon: 'text',
  description: 'test',
  version: '1.0.0',
  source: 'builtin',
  previewHint: 'overlay-text',
  configSchema: [],
}

function buildOperation(params: Record<string, unknown>): VideoEditOperation {
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

describe('canvas-contracts crop timeline space', () => {
  it('resolves applied crop space for timeline overlays', () => {
    const cropOp: VideoEditOperation = {
      id: 'crop1',
      pluginId: 'builtin.crop',
      enabled: true,
      order: 1,
      params: {
        mode: 'manual',
        cropRegion: { x: 10, y: 12, w: 80, h: 70 },
        applyToTimeline: true,
      },
    }
    const overlayOp: VideoEditOperation = {
      id: 'ov1',
      pluginId: 'builtin.watermark_text',
      enabled: true,
      order: 2,
      params: {},
    }

    const timeline = resolveTimelineCropSpace([cropOp, overlayOp], null)
    expect(timeline).toEqual({ x: 10, y: 12, w: 80, h: 70 })

    const space = resolveCanvasSpace(overlayOp, overlayTextPlugin, [cropOp, overlayOp], null)
    expect(space).toEqual({ x: 10, y: 12, w: 80, h: 70 })
  })

  it('ignores non-applied crop operations for timeline space', () => {
    const cropOp: VideoEditOperation = {
      id: 'crop2',
      pluginId: 'builtin.crop',
      enabled: true,
      order: 1,
      params: {
        mode: 'manual',
        cropRegion: { x: 10, y: 10, w: 80, h: 80 },
        applyToTimeline: false,
      },
    }
    const overlayOp: VideoEditOperation = {
      id: 'ov2',
      pluginId: 'builtin.watermark_text',
      enabled: true,
      order: 2,
      params: {},
    }

    expect(resolveTimelineCropSpace([cropOp, overlayOp], null)).toBeNull()
    expect(resolveCanvasSpace(overlayOp, overlayTextPlugin, [cropOp, overlayOp], null)).toEqual({
      x: 0, y: 0, w: 100, h: 100,
    })
  })

  it('keeps crop operation itself on full canvas space', () => {
    const cropOp: VideoEditOperation = {
      id: 'crop3',
      pluginId: 'builtin.crop',
      enabled: true,
      order: 1,
      params: {
        mode: 'manual',
        cropRegion: { x: 5, y: 5, w: 90, h: 90 },
        applyToTimeline: true,
      },
    }
    const space = resolveCanvasSpace(cropOp, cropPlugin, [cropOp], null)
    expect(space).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
})

import { describe, expect, it } from 'vitest'
import resize from '../../../../src/core/video-edit/plugins/transform/resize'

const ctx = {
  inputWidth: 1080,
  inputHeight: 1920,
  inputDurationSec: 60,
  inputFps: 30,
  tempDir: 'tmp',
  assetResolver: (assetId: string) => assetId,
  nextInputIndex: () => 1,
  instanceKey: 'resize_1',
}

describe('resize plugin', () => {
  it('uses custom pad color for interactive canvas scaling', () => {
    const filters = resize.buildFilters(
      {
        widthPercent: 60,
        heightPercent: 60,
        offsetPercent: { x: 20, y: 20 },
        padColor: '#12ab34',
      },
      ctx,
    )

    expect(filters).toHaveLength(2)
    expect(filters[1].filter).toBe('pad')
    expect(filters[1].options.color).toBe('0x12ab34')
  })

  it('falls back to black when pad color is invalid', () => {
    const filters = resize.buildFilters(
      {
        width: 720,
        height: 1280,
        scaleMode: 'fit',
        padColor: 'invalid-color',
      },
      ctx,
    )

    const pad = filters.find((f) => f.filter === 'pad')
    expect(pad?.options.color).toBe('black')
  })
})

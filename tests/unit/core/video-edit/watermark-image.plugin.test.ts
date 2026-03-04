import { describe, expect, it } from 'vitest'
import watermarkImage from '../../../../src/core/video-edit/plugins/overlay/watermark-image'
import type { PluginContext } from '../../../../src/core/video-edit/types'

function buildContext(): PluginContext {
  let nextInput = 1
  return {
    inputWidth: 1080,
    inputHeight: 1920,
    inputDurationSec: 60,
    inputFps: 30,
    tempDir: 'tmp',
    assetResolver: (assetId) => assetId,
    nextInputIndex: () => nextInput++,
    additionalInputStartIndex: 1,
    instanceKey: 'op1',
  }
}

describe('watermark-image plugin', () => {
  it('keeps aspect ratio and applies opacity + rotation chain', () => {
    const filters = watermarkImage.buildFilters(
      {
        image: 'C:/logo.png',
        overlaySize: { w: 30, h: 70 },
        keepAspectRatio: true,
        opacity: 0.6,
        rotation: 45,
      },
      buildContext(),
    )

    expect(filters[0].filter).toBe('scale2ref')
    expect(filters[0].options.w).toBe('main_w*0.3')
    expect(filters[0].options.h).toBe(-1)
    expect(filters.some((f) => f.filter === 'colorchannelmixer')).toBe(true)
    expect(filters.some((f) => f.filter === 'rotate')).toBe(true)

    const overlay = filters.find((f) => f.filter === 'overlay')
    expect(overlay?.inputs).toEqual(['base_op1', 'wm_rot_op1'])
  })

  it('supports unlocked aspect ratio with explicit width and height percentages', () => {
    const filters = watermarkImage.buildFilters(
      {
        image: 'C:/logo.png',
        overlaySize: { w: 25, h: 40 },
        keepAspectRatio: false,
        opacity: 1,
        rotation: 0,
      },
      buildContext(),
    )

    expect(filters[0].filter).toBe('scale2ref')
    expect(filters[0].options.w).toBe('main_w*0.25')
    expect(filters[0].options.h).toBe('main_h*0.4')
    expect(filters.some((f) => f.filter === 'rotate')).toBe(false)
  })
})

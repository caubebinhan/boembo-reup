import { describe, expect, it } from 'vitest'
import watermarkText from '../../../../src/core/video-edit/plugins/overlay/watermark-text'
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
    instanceKey: 'txt1',
  }
}

describe('watermark-text plugin', () => {
  it('builds drawtext filter without non-portable font option', () => {
    const filters = watermarkText.buildFilters(
      {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 28,
      },
      buildContext(),
    )

    expect(filters).toHaveLength(1)
    expect(filters[0].filter).toBe('drawtext')
    expect((filters[0].options as Record<string, unknown>).font).toBeUndefined()
  })
})

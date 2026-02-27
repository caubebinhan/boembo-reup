import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { mapArtifactsForView } from '../../../../../../src/renderer/src/components/troubleshootingPanel.helpers'

export const screenshotPathRendersImageCase: UnitCaseDefinition = {
  id: 'unit.troubleshooting.artifact-view.screenshot-path-renders-image',
  suite: 'unit',
  group: 'artifact-view',
  title: 'screenshot file path is converted to image preview source',
  meta: {
    objective: 'Render screenshot artifact as image instead of raw path text.',
    labels: ['artifact', 'screenshot', 'image-preview'],
    investigationHints: [
      'Check shouldRenderArtifactAsImage and extension detection.',
      'Verify toArtifactImageSrc path conversion to local-thumb://',
      'Fixture path is derived from runtime platform/arch (win/mac intel/mac apple silicon).',
    ],
  },
  run: () => {
    const isWindows = process.platform === 'win32'
    const isMacAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64'
    const isMacIntel = process.platform === 'darwin' && process.arch === 'x64'
    const runtimeSlug = isWindows
      ? 'windows'
      : isMacAppleSilicon
        ? 'macos-arm64'
        : isMacIntel
          ? 'macos-x64'
          : `${process.platform}-${process.arch}`

    const baseDir = isWindows
      ? `C:\\temp\\boembo_${runtimeSlug}`
      : `/tmp/boembo_${runtimeSlug}`
    const screenshotPath = isWindows
      ? `${baseDir}\\debug_shot.png`
      : `${baseDir}/debug_shot.png`
    const htmlPath = isWindows
      ? `${baseDir}\\debug_dump.html`
      : `${baseDir}/debug_dump.html`

    const artifacts = mapArtifactsForView(
      {
        screenshot: screenshotPath,
        html: htmlPath,
      },
      [
        { key: 'screenshot', type: 'screenshot' },
        { key: 'html', type: 'html' },
      ]
    )

    const screenshot = artifacts.find(item => item.key === 'screenshot')
    const html = artifacts.find(item => item.key === 'html')

    expect(screenshot?.mode).toBe('image')
    expect(screenshot?.imageSrc).toBe(`local-thumb://${screenshotPath.replace(/\\/g, '/')}`)
    expect(html?.mode).toBe('text')
  },
}

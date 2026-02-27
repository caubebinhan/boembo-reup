import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { mapArtifactsForView } from '../../../../troubleshootingPanel.helpers'

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
    ],
  },
  run: () => {
    const artifacts = mapArtifactsForView(
      {
        screenshot: 'C:\\temp\\debug_shot.png',
        html: 'C:\\temp\\debug_dump.html',
      },
      [
        { key: 'screenshot', type: 'screenshot' },
        { key: 'html', type: 'html' },
      ]
    )

    const screenshot = artifacts.find(item => item.key === 'screenshot')
    const html = artifacts.find(item => item.key === 'html')

    expect(screenshot?.mode).toBe('image')
    expect(screenshot?.imageSrc).toBe('local-thumb://C:/temp/debug_shot.png')
    expect(html?.mode).toBe('text')
  },
}

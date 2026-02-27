import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { mapArtifactsForView } from '../../../../troubleshootingPanel.helpers'

export const dataUrlRendersImageCase: UnitCaseDefinition = {
  id: 'unit.troubleshooting.artifact-view.data-url-renders-image',
  suite: 'unit',
  group: 'artifact-view',
  title: 'data image url artifact is rendered as image preview',
  meta: {
    objective: 'Support screenshot artifacts that are serialized as data URLs.',
    labels: ['artifact', 'screenshot', 'data-url'],
    investigationHints: [
      'Inspect shouldRenderArtifactAsImage for data:image/ handling.',
      'Verify no accidental truncation in preview renderer path.',
    ],
  },
  run: () => {
    const artifacts = mapArtifactsForView({
      screenshot: 'data:image/png;base64,ZmFrZQ==',
    })

    expect(artifacts[0].mode).toBe('image')
    expect(artifacts[0].imageSrc).toContain('data:image/png;base64')
  },
}

import type { UnitCaseGroup } from '../../types'
import { dataUrlRendersImageCase } from './data-url-renders-image.case'
import { screenshotPathRendersImageCase } from './screenshot-path-renders-image.case'

export const artifactViewCaseGroup: UnitCaseGroup = {
  id: 'artifact-view',
  label: 'Artifact Preview',
  meta: {
    objective: 'Validate screenshot artifacts render as images with safe preview fallbacks.',
    investigationHints: [
      'Inspect screenshot type hints from caseMeta.artifacts.',
      'Validate file-path and data-url conversion flows.',
    ],
  },
  cases: [
    screenshotPathRendersImageCase,
    dataUrlRendersImageCase,
  ],
}

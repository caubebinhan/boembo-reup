import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { classifyCaseSuite } from '../../../../troubleshootingPanel.helpers'

export const realPublishIsE2ECase: UnitCaseDefinition = {
  id: 'unit.troubleshooting.suite-classification.real-publish-is-e2e',
  suite: 'unit',
  group: 'suite-classification',
  title: 'real_publish case is mapped to E2E suite',
  meta: {
    objective: 'Guarantee risky publish scenarios stay in E2E grouping.',
    labels: ['suite', 'classification', 'risk'],
    investigationHints: [
      'Check classifyCaseSuite priority order for risk versus tags.',
      'Verify case.risk is not overridden by metadata defaults.',
    ],
  },
  run: () => {
    const suite = classifyCaseSuite({
      id: 'case-1',
      title: 'Publish real',
      risk: 'real_publish',
    })
    expect(suite).toBe('e2e')
  },
}

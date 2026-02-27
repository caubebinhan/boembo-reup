import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { classifyCaseSuite } from '../../../../troubleshootingPanel.helpers'

export const staticAnalysisIsUnitCase: UnitCaseDefinition = {
  id: 'unit.troubleshooting.suite-classification.static-analysis-is-unit',
  suite: 'unit',
  group: 'suite-classification',
  title: 'static-analysis tag is mapped to Unit suite',
  meta: {
    objective: 'Keep static contract checks inside unit test grouping.',
    labels: ['suite', 'classification', 'static-analysis'],
    investigationHints: [
      'Confirm static-analysis tag is included in the unit tag set.',
      'Check if any new tag rule accidentally reclassifies to integration/e2e.',
    ],
  },
  run: () => {
    const suite = classifyCaseSuite({
      id: 'case-2',
      title: 'Static checks',
      risk: 'safe',
      tags: ['static-analysis'],
    })
    expect(suite).toBe('unit')
  },
}

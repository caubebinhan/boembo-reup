import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { classifyCaseSuite } from '../../../../troubleshootingPanel.helpers'

export const dbIsIntegrationCase: UnitCaseDefinition = {
  id: 'unit.troubleshooting.suite-classification.db-is-integration',
  suite: 'unit',
  group: 'suite-classification',
  title: 'db tag is mapped to Integration suite',
  meta: {
    objective: 'Ensure data-flow/db cases stay in integration grouping.',
    labels: ['suite', 'classification', 'db'],
    investigationHints: [
      'Inspect integration tag set in classifyCaseSuite.',
      'Verify case tags are normalized to lowercase before matching.',
    ],
  },
  run: () => {
    const suite = classifyCaseSuite({
      id: 'case-3',
      title: 'DB flow',
      risk: 'safe',
      tags: ['db'],
    })
    expect(suite).toBe('integration')
  },
}

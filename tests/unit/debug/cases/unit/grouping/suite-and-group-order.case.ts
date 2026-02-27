import { expect } from 'vitest'
import type { UnitCaseDefinition } from '../../types'
import { groupCasesBySuiteAndGroup } from '../../../../../../src/renderer/src/components/troubleshootingPanel.helpers'

export const suiteAndGroupOrderCase: UnitCaseDefinition = {
  id: 'unit.troubleshooting.grouping.suite-and-group-order',
  suite: 'unit',
  group: 'grouping',
  title: 'cases are grouped by suite/group with deterministic ordering',
  meta: {
    objective: 'Keep UI grouping stable for catalog scanning and AI triage.',
    labels: ['grouping', 'ordering', 'ui-catalog'],
    investigationHints: [
      'Check SUITE_ORDER and level ranking constants.',
      'Verify title fallback ordering for same suite/group/level.',
    ],
  },
  run: () => {
    const grouped = groupCasesBySuiteAndGroup([
      {
        id: 'c3',
        title: 'Unit basic',
        risk: 'safe',
        tags: ['static-analysis'],
        level: 'basic',
        group: 'scan',
      },
      {
        id: 'c1',
        title: 'E2E publish',
        risk: 'real_publish',
        level: 'advanced',
        group: 'publish',
      },
      {
        id: 'c4',
        title: 'Unit advanced',
        risk: 'safe',
        tags: ['fixture'],
        level: 'advanced',
        group: 'scan',
      },
      {
        id: 'c2',
        title: 'Integration db',
        risk: 'safe',
        tags: ['db'],
        level: 'intermediate',
        group: 'campaign',
      },
    ])

    expect(grouped.map(section => section.suite)).toEqual(['e2e', 'integration', 'unit'])
    expect(grouped[0].groups[0].group).toBe('publish')
    expect(grouped[1].groups[0].group).toBe('campaign')
    expect(grouped[2].groups[0].items.map(item => item.id)).toEqual(['c3', 'c4'])
  },
}

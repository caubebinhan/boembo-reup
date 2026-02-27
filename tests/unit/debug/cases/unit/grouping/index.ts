import type { UnitCaseGroup } from '../../types'
import { suiteAndGroupOrderCase } from './suite-and-group-order.case'

export const groupingCaseGroup: UnitCaseGroup = {
  id: 'grouping',
  label: 'Grouping and Ordering',
  meta: {
    objective: 'Validate deterministic grouping order for troubleshooting case catalog UI.',
    investigationHints: [
      'Check SUITE_ORDER and group sort logic.',
      'Check level priority (basic -> intermediate -> advanced).',
    ],
  },
  cases: [suiteAndGroupOrderCase],
}

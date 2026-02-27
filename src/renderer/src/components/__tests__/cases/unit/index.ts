import type { UnitCaseDefinition, UnitCaseGroup } from '../types'
import { artifactViewCaseGroup } from './artifact-view'
import { groupingCaseGroup } from './grouping'
import { suiteClassificationGroup } from './suite-classification'

export const unitCaseGroups: UnitCaseGroup[] = [
  suiteClassificationGroup,
  groupingCaseGroup,
  artifactViewCaseGroup,
]

export const unitCaseIndex = new Map<string, UnitCaseDefinition>(
  unitCaseGroups.flatMap(group => group.cases.map(testCase => [testCase.id, testCase] as const))
)

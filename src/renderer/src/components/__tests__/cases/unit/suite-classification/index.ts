import type { UnitCaseGroup } from '../../types'
import { dbIsIntegrationCase } from './db-is-integration.case'
import { realPublishIsE2ECase } from './real-publish-is-e2e.case'
import { staticAnalysisIsUnitCase } from './static-analysis-is-unit.case'

export const suiteClassificationGroup: UnitCaseGroup = {
  id: 'suite-classification',
  label: 'Suite Classification',
  meta: {
    objective: 'Validate mapping from case metadata into suite buckets (E2E/Integration/Unit).',
    investigationHints: [
      'Compare failed case tags/risk with classifyCaseSuite branches.',
      'Check precedence when a case matches multiple suite rules.',
    ],
  },
  cases: [
    realPublishIsE2ECase,
    staticAnalysisIsUnitCase,
    dbIsIntegrationCase,
  ],
}

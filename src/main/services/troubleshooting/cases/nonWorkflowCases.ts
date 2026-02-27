import type { TroubleshootingCaseDefinition } from '../types'

const MAIN_SCOPE = { workflowId: 'main', workflowVersion: '1.0' as const }
const EXTERNAL_RUNNER_TAGS = ['catalog-only', 'external-runner']
const UNIT_RUN_COMMAND = 'npm run test:unit'
const E2E_RUN_COMMAND = 'npm run test:e2e'

type PlannedCaseInput = Omit<
  TroubleshootingCaseDefinition,
  'workflowId' | 'workflowVersion' | 'risk' | 'implemented'
>
type ExternalMirrorCategory = 'unit' | 'e2e'

type ExternalMirrorInput = {
  id: string
  title: string
  description: string
  category: ExternalMirrorCategory
  group: 'external-unit' | 'external-e2e'
  level: 'basic' | 'intermediate' | 'advanced'
  source: string
  caseKey?: 'UNIT_CASE_ID' | 'TEST_CASE_ID'
  caseValue?: string
  command?: string
  tags?: string[]
  extraParameters?: Array<{ key: string; value: string }>
}

function plannedCase(input: PlannedCaseInput): TroubleshootingCaseDefinition {
  return {
    ...MAIN_SCOPE,
    risk: 'safe',
    implemented: false,
    ...input
  }
}

function externalMirrorCase(input: ExternalMirrorInput): TroubleshootingCaseDefinition {
  const command = input.command ?? (input.category === 'unit' ? UNIT_RUN_COMMAND : E2E_RUN_COMMAND)
  const tags = Array.from(new Set([input.category, ...(input.tags ?? []), ...EXTERNAL_RUNNER_TAGS]))
  const caseParam =
    input.caseKey && input.caseValue ? [{ key: input.caseKey, value: input.caseValue }] : []

  return plannedCase({
    id: input.id,
    title: input.title,
    description: input.description,
    category: input.category,
    group: input.group,
    tags,
    level: input.level,
    meta: {
      parameters: [
        { key: 'command', value: command },
        ...caseParam,
        ...(input.extraParameters ?? [])
      ],
      notes: [`Source: ${input.source}`]
    }
  })
}

export const nonWorkflowTroubleshootingCases: TroubleshootingCaseDefinition[] = [
  externalMirrorCase({
    id: 'unit.troubleshooting.suite-classification.real-publish-is-e2e',
    title: 'Unit Mirror: real_publish maps to E2E suite',
    description: 'Mirrors CLI unit case for suite classification logic.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit'],
    level: 'basic',
    caseKey: 'UNIT_CASE_ID',
    caseValue: 'unit.troubleshooting.suite-classification.real-publish-is-e2e',
    source: 'tests/unit/debug/cases/unit/suite-classification/real-publish-is-e2e.case.ts'
  }),
  externalMirrorCase({
    id: 'unit.troubleshooting.suite-classification.static-analysis-is-unit',
    title: 'Unit Mirror: static-analysis maps to Unit suite',
    description: 'Mirrors CLI unit case for static-analysis tag classification.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit'],
    level: 'basic',
    caseKey: 'UNIT_CASE_ID',
    caseValue: 'unit.troubleshooting.suite-classification.static-analysis-is-unit',
    source: 'tests/unit/debug/cases/unit/suite-classification/static-analysis-is-unit.case.ts'
  }),
  externalMirrorCase({
    id: 'unit.troubleshooting.suite-classification.db-is-integration',
    title: 'Unit Mirror: db tag maps to Integration suite',
    description: 'Mirrors CLI unit case for db tag classification.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit'],
    level: 'basic',
    caseKey: 'UNIT_CASE_ID',
    caseValue: 'unit.troubleshooting.suite-classification.db-is-integration',
    source: 'tests/unit/debug/cases/unit/suite-classification/db-is-integration.case.ts'
  }),
  externalMirrorCase({
    id: 'unit.troubleshooting.grouping.suite-and-group-order',
    title: 'Unit Mirror: grouped ordering is deterministic',
    description: 'Mirrors CLI unit case for grouping and level ordering.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit'],
    level: 'basic',
    caseKey: 'UNIT_CASE_ID',
    caseValue: 'unit.troubleshooting.grouping.suite-and-group-order',
    source: 'tests/unit/debug/cases/unit/grouping/suite-and-group-order.case.ts'
  }),
  externalMirrorCase({
    id: 'unit.troubleshooting.artifact-view.screenshot-path-renders-image',
    title: 'Unit Mirror: screenshot path renders as image',
    description: 'Mirrors CLI unit case for screenshot artifact preview rendering.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit'],
    level: 'basic',
    caseKey: 'UNIT_CASE_ID',
    caseValue: 'unit.troubleshooting.artifact-view.screenshot-path-renders-image',
    source: 'tests/unit/debug/cases/unit/artifact-view/screenshot-path-renders-image.case.ts'
  }),
  externalMirrorCase({
    id: 'unit.troubleshooting.artifact-view.data-url-renders-image',
    title: 'Unit Mirror: data URL renders as image',
    description: 'Mirrors CLI unit case for data:image artifact preview rendering.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit'],
    level: 'basic',
    caseKey: 'UNIT_CASE_ID',
    caseValue: 'unit.troubleshooting.artifact-view.data-url-renders-image',
    source: 'tests/unit/debug/cases/unit/artifact-view/data-url-renders-image.case.ts'
  }),
  externalMirrorCase({
    id: 'e2e.troubleshooting.suites.grouping-visible',
    title: 'E2E Mirror: suite grouping visible',
    description: 'Mirrors Playwright e2e case for troubleshooting suite heading visibility.',
    category: 'e2e',
    group: 'external-e2e',
    tags: ['e2e'],
    level: 'intermediate',
    caseKey: 'TEST_CASE_ID',
    caseValue: 'e2e.troubleshooting.suites.grouping-visible',
    source: 'tests/e2e/cases/troubleshooting/grouping-suites.case.mjs'
  }),
  externalMirrorCase({
    id: 'e2e.troubleshooting.artifact.screenshot-preview-visible',
    title: 'E2E Mirror: screenshot artifact preview visible',
    description: 'Mirrors Playwright e2e case for screenshot image preview rendering.',
    category: 'e2e',
    group: 'external-e2e',
    tags: ['e2e'],
    level: 'intermediate',
    caseKey: 'TEST_CASE_ID',
    caseValue: 'e2e.troubleshooting.artifact.screenshot-preview-visible',
    source: 'tests/e2e/cases/troubleshooting/screenshot-preview.case.mjs'
  }),
  externalMirrorCase({
    id: 'e2e.troubleshooting.sentry.feedback-links-visible',
    title: 'E2E Mirror: sentry feedback links visible',
    description: 'Mirrors Playwright e2e case for Sentry event/issue links in debug tab.',
    category: 'e2e',
    group: 'external-e2e',
    tags: ['e2e'],
    level: 'intermediate',
    caseKey: 'TEST_CASE_ID',
    caseValue: 'e2e.troubleshooting.sentry.feedback-links-visible',
    source: 'tests/e2e/cases/troubleshooting/sentry-feedback-links.case.mjs'
  }),
  externalMirrorCase({
    id: 'unit.core.pipeline-runner.sequence-resolve-vars',
    title: 'Unit Mirror: pipeline runner resolves vars in sequence',
    description: 'Mirrors core engine unit test for sequential run + variable resolution contract.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'core'],
    level: 'intermediate',
    source: 'tests/unit/core/PipelineRunner.test.ts'
  }),
  externalMirrorCase({
    id: 'unit.main.sentry-staging.service-contracts',
    title: 'Unit Mirror: sentry staging service contracts',
    description:
      'Mirrors main-process unit tests for Sentry event-id normalization/send/verify contracts.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'sentry'],
    level: 'intermediate',
    source: 'tests/unit/main/SentryStagingService.test.ts'
  })
]

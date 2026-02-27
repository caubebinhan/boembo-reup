import type { TroubleshootingCaseDefinition } from '../types'

const MAIN_SCOPE = { workflowId: 'main', workflowVersion: '1.0' as const }

type PlannedCaseInput = Omit<TroubleshootingCaseDefinition, 'workflowId' | 'workflowVersion' | 'risk' | 'implemented'>

function plannedCase(input: PlannedCaseInput): TroubleshootingCaseDefinition {
  return {
    ...MAIN_SCOPE,
    risk: 'safe',
    implemented: false,
    ...input,
  }
}

export const nonWorkflowTroubleshootingCases: TroubleshootingCaseDefinition[] = [
  plannedCase({
    id: 'unit.troubleshooting.suite-classification.real-publish-is-e2e',
    title: 'Unit Mirror: real_publish maps to E2E suite',
    description: 'Mirrors CLI unit case for suite classification logic.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'catalog-only', 'external-runner'],
    level: 'basic',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:unit' },
        { key: 'UNIT_CASE_ID', value: 'unit.troubleshooting.suite-classification.real-publish-is-e2e' },
      ],
      notes: ['Source: tests/unit/debug/cases/unit/suite-classification/real-publish-is-e2e.case.ts'],
    },
  }),
  plannedCase({
    id: 'unit.troubleshooting.suite-classification.static-analysis-is-unit',
    title: 'Unit Mirror: static-analysis maps to Unit suite',
    description: 'Mirrors CLI unit case for static-analysis tag classification.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'catalog-only', 'external-runner'],
    level: 'basic',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:unit' },
        { key: 'UNIT_CASE_ID', value: 'unit.troubleshooting.suite-classification.static-analysis-is-unit' },
      ],
      notes: ['Source: tests/unit/debug/cases/unit/suite-classification/static-analysis-is-unit.case.ts'],
    },
  }),
  plannedCase({
    id: 'unit.troubleshooting.suite-classification.db-is-integration',
    title: 'Unit Mirror: db tag maps to Integration suite',
    description: 'Mirrors CLI unit case for db tag classification.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'catalog-only', 'external-runner'],
    level: 'basic',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:unit' },
        { key: 'UNIT_CASE_ID', value: 'unit.troubleshooting.suite-classification.db-is-integration' },
      ],
      notes: ['Source: tests/unit/debug/cases/unit/suite-classification/db-is-integration.case.ts'],
    },
  }),
  plannedCase({
    id: 'unit.troubleshooting.grouping.suite-and-group-order',
    title: 'Unit Mirror: grouped ordering is deterministic',
    description: 'Mirrors CLI unit case for grouping and level ordering.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'catalog-only', 'external-runner'],
    level: 'basic',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:unit' },
        { key: 'UNIT_CASE_ID', value: 'unit.troubleshooting.grouping.suite-and-group-order' },
      ],
      notes: ['Source: tests/unit/debug/cases/unit/grouping/suite-and-group-order.case.ts'],
    },
  }),
  plannedCase({
    id: 'unit.troubleshooting.artifact-view.screenshot-path-renders-image',
    title: 'Unit Mirror: screenshot path renders as image',
    description: 'Mirrors CLI unit case for screenshot artifact preview rendering.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'catalog-only', 'external-runner'],
    level: 'basic',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:unit' },
        { key: 'UNIT_CASE_ID', value: 'unit.troubleshooting.artifact-view.screenshot-path-renders-image' },
      ],
      notes: ['Source: tests/unit/debug/cases/unit/artifact-view/screenshot-path-renders-image.case.ts'],
    },
  }),
  plannedCase({
    id: 'unit.troubleshooting.artifact-view.data-url-renders-image',
    title: 'Unit Mirror: data URL renders as image',
    description: 'Mirrors CLI unit case for data:image artifact preview rendering.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'catalog-only', 'external-runner'],
    level: 'basic',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:unit' },
        { key: 'UNIT_CASE_ID', value: 'unit.troubleshooting.artifact-view.data-url-renders-image' },
      ],
      notes: ['Source: tests/unit/debug/cases/unit/artifact-view/data-url-renders-image.case.ts'],
    },
  }),
  plannedCase({
    id: 'e2e.troubleshooting.suites.grouping-visible',
    title: 'E2E Mirror: suite grouping visible',
    description: 'Mirrors Playwright e2e case for troubleshooting suite heading visibility.',
    category: 'e2e',
    group: 'external-e2e',
    tags: ['e2e', 'catalog-only', 'external-runner'],
    level: 'intermediate',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:e2e' },
        { key: 'TEST_CASE_ID', value: 'e2e.troubleshooting.suites.grouping-visible' },
      ],
      notes: ['Source: tests/e2e/cases/troubleshooting/grouping-suites.case.mjs'],
    },
  }),
  plannedCase({
    id: 'e2e.troubleshooting.artifact.screenshot-preview-visible',
    title: 'E2E Mirror: screenshot artifact preview visible',
    description: 'Mirrors Playwright e2e case for screenshot image preview rendering.',
    category: 'e2e',
    group: 'external-e2e',
    tags: ['e2e', 'catalog-only', 'external-runner'],
    level: 'intermediate',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:e2e' },
        { key: 'TEST_CASE_ID', value: 'e2e.troubleshooting.artifact.screenshot-preview-visible' },
      ],
      notes: ['Source: tests/e2e/cases/troubleshooting/screenshot-preview.case.mjs'],
    },
  }),
  plannedCase({
    id: 'e2e.troubleshooting.sentry.feedback-links-visible',
    title: 'E2E Mirror: sentry feedback links visible',
    description: 'Mirrors Playwright e2e case for Sentry event/issue links in debug tab.',
    category: 'e2e',
    group: 'external-e2e',
    tags: ['e2e', 'catalog-only', 'external-runner'],
    level: 'intermediate',
    meta: {
      parameters: [
        { key: 'command', value: 'npm run test:e2e' },
        { key: 'TEST_CASE_ID', value: 'e2e.troubleshooting.sentry.feedback-links-visible' },
      ],
      notes: ['Source: tests/e2e/cases/troubleshooting/sentry-feedback-links.case.mjs'],
    },
  }),
  plannedCase({
    id: 'unit.core.pipeline-runner.sequence-resolve-vars',
    title: 'Unit Mirror: pipeline runner resolves vars in sequence',
    description: 'Mirrors core engine unit test for sequential run + variable resolution contract.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'core', 'catalog-only', 'external-runner'],
    level: 'intermediate',
    meta: {
      parameters: [{ key: 'command', value: 'npm run test:unit' }],
      notes: ['Source: tests/unit/core/PipelineRunner.test.ts'],
    },
  }),
  plannedCase({
    id: 'unit.main.sentry-staging.service-contracts',
    title: 'Unit Mirror: sentry staging service contracts',
    description: 'Mirrors main-process unit tests for Sentry event-id normalization/send/verify contracts.',
    category: 'unit',
    group: 'external-unit',
    tags: ['unit', 'sentry', 'catalog-only', 'external-runner'],
    level: 'intermediate',
    meta: {
      parameters: [{ key: 'command', value: 'npm run test:unit' }],
      notes: ['Source: tests/unit/main/SentryStagingService.test.ts'],
    },
  }),
]

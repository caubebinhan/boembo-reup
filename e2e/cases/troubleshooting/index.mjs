import { groupingSuitesCase } from './grouping-suites.case.mjs'
import { sentryFeedbackLinksCase } from './sentry-feedback-links.case.mjs'
import { screenshotPreviewCase } from './screenshot-preview.case.mjs'

/** @type {import('../types.mjs').E2ECaseGroup} */
export const troubleshootingPanelCaseGroup = {
  id: 'troubleshooting-panel',
  label: 'Troubleshooting Panel',
  meta: {
    objective: 'Validate troubleshooting catalog grouping and artifact preview UX.',
    investigationHints: [
      'Use case id to run a single failing flow with TEST_CASE_ID.',
      'Inspect fixture payload in e2e/cases/troubleshooting/fixtures.mjs.',
    ],
  },
  cases: [
    groupingSuitesCase,
    screenshotPreviewCase,
    sentryFeedbackLinksCase,
  ],
}

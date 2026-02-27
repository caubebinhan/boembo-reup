import { resetWorkflowVersionFilters, selectRunByTitle } from './helpers.mjs'

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const failedRunSentryActionCase = {
  id: 'e2e.troubleshooting.run-details.failed-run-shows-sentry-action',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Failed run shows Send To Sentry action',
  meta: {
    objective: 'Ensure failed status exposes Sentry action button.',
    labels: ['ui', 'run-details', 'sentry', 'failed'],
    investigationHints: [
      'Button should only render when selectedRun.status === failed.',
      'Verify run selection state in Run History pane.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    const sentryButtonVisible = await page.getByRole('button', { name: 'Send To Sentry' }).isVisible()
    assert.equal(sentryButtonVisible, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const passedRunNoSentryActionCase = {
  id: 'e2e.troubleshooting.run-details.passed-run-hides-sentry-action',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Passed run hides Send To Sentry action',
  meta: {
    objective: 'Ensure non-failed runs do not show Sentry action button.',
    labels: ['ui', 'run-details', 'sentry', 'passed'],
    investigationHints: [
      'Confirm selected run status chip is passed.',
      'Sentry button should not be rendered for passed/running runs.',
    ],
  },
  run: async ({ page, assert }) => {
    await selectRunByTitle(page, 'Fixture Integration Passed Run')
    const sentryButtonCount = await page.getByRole('button', { name: 'Send To Sentry' }).count()
    assert.equal(sentryButtonCount, 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const artifactTextPreviewCase = {
  id: 'e2e.troubleshooting.artifact.text-preview-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Text artifacts render as text preview (non-image)',
  meta: {
    objective: 'Ensure non-image artifacts stay in text mode preview.',
    labels: ['ui', 'artifact', 'text', 'edge'],
    investigationHints: [
      'mapArtifactsForView should keep mode=text for plain strings/json.',
      'No image tag should appear for text-only artifact set.',
    ],
  },
  run: async ({ page, assert }) => {
    await selectRunByTitle(page, 'Fixture Integration Passed Run')
    await page.locator('span.text-xs.font-mono.text-cyan-300:has-text("debugSummary")').first().waitFor({ state: 'visible' })
    await page.locator('pre').filter({ hasText: 'DB merge completed successfully.' }).first().waitFor({ state: 'visible' })
    const imageCount = await page.locator('img[data-artifact-kind="image"]').count()
    assert.equal(imageCount, 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const artifactImagePathPreviewCase = {
  id: 'e2e.troubleshooting.artifact.absolute-path-renders-image',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Absolute image path artifact renders image preview',
  meta: {
    objective: 'Ensure absolute png path is converted to local-thumb:// image preview.',
    labels: ['ui', 'artifact', 'image', 'path'],
    investigationHints: [
      'Check shouldRenderArtifactAsImage + toArtifactImageSrc helper logic.',
      'Fixture has screenshotPath absolute path with screenshot type hint.',
    ],
  },
  run: async ({ page, assert }) => {
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    const srcList = await page.locator('img[data-artifact-kind="image"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('src') || '')
    )
    assert.equal(srcList.some((src) => src.startsWith('data:image/')), true)
    assert.equal(srcList.some((src) => src.startsWith('local-thumb://')), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const cappedLogHintCase = {
  id: 'e2e.troubleshooting.logs.capped-tail-indicator-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run details show capped-log indicator when totals exceed loaded logs',
  meta: {
    objective: 'Verify capped log warning appears for large run histories.',
    labels: ['ui', 'logs', 'edge', 'run-details'],
    investigationHints: [
      'Condition: selectedRun.logStats.total > selectedRun.logs.length.',
      'This warning helps avoid confusion when logs are truncated.',
    ],
  },
  run: async ({ page, assert }) => {
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    const hint = page.getByText('Showing last')
    await hint.waitFor({ state: 'visible' })
    assert.equal(await hint.isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const footprintEmptyStateCase = {
  id: 'e2e.troubleshooting.footprint.empty-state-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run details show footprint empty state when footprint is missing',
  meta: {
    objective: 'Ensure footprint panel renders explicit empty state text.',
    labels: ['ui', 'footprint', 'empty-state'],
    investigationHints: [
      'Select a run without diagnosticFootprint.',
      'Verify empty-state message instead of stale previous JSON.',
    ],
  },
  run: async ({ page, assert }) => {
    await selectRunByTitle(page, 'Fixture Main Passed Run')
    const emptyText = page.getByText('No diagnostic footprint yet')
    await emptyText.waitFor({ state: 'visible' })
    assert.equal(await emptyText.isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const fullLogModalCase = {
  id: 'e2e.troubleshooting.logs.full-log-modal-open-close',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Full log modal opens and closes with selected run snapshot',
  meta: {
    objective: 'Verify full log overlay lifecycle and core content visibility.',
    labels: ['ui', 'logs', 'modal', 'edge'],
    investigationHints: [
      'Open from Run Details actions and ensure Close button returns to panel.',
      'Snapshot should include selected run id/case id context.',
    ],
  },
  run: async ({ page, assert }) => {
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    await page.getByRole('button', { name: 'View Full Log' }).click()
    await page.getByText('Full Run Log').waitFor({ state: 'visible' })
    const modalVisible = await page.getByText('Full Run Log').isVisible()
    assert.equal(modalVisible, true)
    await page.getByRole('button', { name: 'Close' }).click()
    const modalCount = await page.getByText('Full Run Log').count()
    assert.equal(modalCount, 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runSummaryFingerprintPathCase = {
  id: 'e2e.troubleshooting.run-details.summary-shows-fingerprint-and-paths',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run summary shows case/run fingerprints and debug file paths',
  meta: {
    objective: 'Ensure summary section exposes forensic identifiers and debug file locations.',
    labels: ['ui', 'run-details', 'fingerprint', 'artifact-path'],
    investigationHints: [
      'Select failed fixture run with case/run fingerprint and debug file paths.',
      'Look under Summary block for Case FP / Run FP / Artifact Manifest / Footprint File.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    await page.locator('div:has-text("Case FP:")').first().waitFor({ state: 'visible' })
    await page.locator('div:has-text("Run FP:")').first().waitFor({ state: 'visible' })

    const summaryText = await page.locator('div:has-text("Artifact Manifest:")').first().textContent()
    assert.ok(summaryText)
    assert.equal(summaryText.includes('C:/tmp/debug-artifacts/fixture-run-failed-v1/artifact-manifest.json'), true)
    assert.equal(summaryText.includes('Footprint File:'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runCaseMetaSectionsCase = {
  id: 'e2e.troubleshooting.run-details.case-meta-sections-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run details render full Case Meta sections for rich fixture',
  meta: {
    objective: 'Verify parameter/check/artifact-plan/message sections are visible when caseMeta exists.',
    labels: ['ui', 'run-details', 'case-meta', 'edge'],
    investigationHints: [
      'Failed fixture run contains parameters/checks/artifacts/pass/error/notes fields.',
      'Each section should render with at least one expected entry.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Publish Failed Run')

    await page.getByText('Parameters', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('db checks', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('ui checks', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('logs checks', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Artifact Plan', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Pass Criteria / Messages', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Error Expectations', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Notes', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('No publish_history row for failed selector drift upload').waitFor({ state: 'visible' })
    assert.equal(await page.getByText('No publish_history row for failed selector drift upload').isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runCaseMetaEmptyStateCase = {
  id: 'e2e.troubleshooting.run-details.case-meta-empty-state-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run details show empty state when case metadata snapshot is absent',
  meta: {
    objective: 'Ensure stale case metadata is not shown for runs without caseMeta.',
    labels: ['ui', 'run-details', 'case-meta', 'empty-state'],
    investigationHints: [
      'Select fixture run without caseMeta payload.',
      'Panel should render explicit empty-state message.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Unit Running Run')
    const emptyText = page.getByText('No case metadata snapshot.')
    await emptyText.waitFor({ state: 'visible' })
    assert.equal(await emptyText.isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const artifactEmptyStateCase = {
  id: 'e2e.troubleshooting.artifact.empty-state-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Artifacts panel shows empty state when run has no artifacts',
  meta: {
    objective: 'Verify artifact panel handles missing result artifacts without stale previews.',
    labels: ['ui', 'artifact', 'empty-state'],
    investigationHints: [
      'Select fixture run with empty result payload.',
      'No artifact outputs message should be visible.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Main Passed Run')
    const emptyText = page.getByText('No artifact outputs recorded for this run.')
    await emptyText.waitFor({ state: 'visible' })
    assert.equal(await emptyText.isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const footprintStatsCase = {
  id: 'e2e.troubleshooting.footprint.stats-visible-for-rich-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Footprint panel shows schema/duration/signal counters for rich run',
  meta: {
    objective: 'Ensure footprint summary row renders key diagnostic metrics when footprint exists.',
    labels: ['ui', 'footprint', 'metrics'],
    investigationHints: [
      'Select failed fixture run with diagnosticFootprint payload.',
      'Verify schema/duration/errors/warns values in footprint summary row.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    const metrics = page.locator('div:has-text("schema=")').first()
    await metrics.waitFor({ state: 'visible' })
    const text = await metrics.textContent()
    assert.ok(text)
    assert.equal(text.includes('schema=1'), true)
    assert.equal(text.includes('duration=1840ms'), true)
    assert.equal(text.includes('errors=1'), true)
    assert.equal(text.includes('warns=2'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const fullLogModalSnapshotContextCase = {
  id: 'e2e.troubleshooting.logs.full-log-modal-snapshot-has-run-context',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Full log modal header includes case id and run id context',
  meta: {
    objective: 'Verify full-log modal header carries selected run identifiers for audit/debug handoff.',
    labels: ['ui', 'logs', 'modal', 'context'],
    investigationHints: [
      'Open full-log modal on failed fixture run.',
      'Header line should include both caseId and run id.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    await page.getByRole('button', { name: 'View Full Log' }).click()
    await page.getByText('Full Run Log').waitFor({ state: 'visible' })
    const header = await page.locator('p.text-xs.text-gray-400.font-mono').first().textContent()
    assert.ok(header)
    assert.equal(header.includes('fixture.case.e2e.publish-path'), true)
    assert.equal(header.includes('fixture-run-failed-v1'), true)
    await page.getByRole('button', { name: 'Close' }).click()
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const noLogsStateCase = {
  id: 'e2e.troubleshooting.logs.empty-state-visible-for-no-log-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'No-log run shows empty logs state in panel and full-log modal',
  meta: {
    objective: 'Ensure runs with zero logs render explicit empty-state text in both log views.',
    labels: ['ui', 'logs', 'empty-state', 'edge'],
    investigationHints: [
      'Select fixture run "Fixture V2 Passed No Logs".',
      'Check both run-details logs panel and full-log modal for empty-state text.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture V2 Passed No Logs')

    const inlineEmpty = page.getByText('No logs recorded.').first()
    await inlineEmpty.waitFor({ state: 'visible' })
    assert.equal(await inlineEmpty.isVisible(), true)

    await page.getByRole('button', { name: 'View Full Log' }).click()
    await page.getByText('Full Run Log').waitFor({ state: 'visible' })
    const modal = page.locator('div.fixed.inset-0.z-50').first()
    const modalEmpty = modal.getByText('No logs recorded.')
    await modalEmpty.waitFor({ state: 'visible' })
    assert.equal(await modalEmpty.isVisible(), true)
    await page.getByRole('button', { name: 'Close' }).click()
  },
}

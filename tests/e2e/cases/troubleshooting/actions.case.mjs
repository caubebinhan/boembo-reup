import {
  clickWorkflowCatalogCard,
  resetWorkflowVersionFilters,
  runCaseButtonByCaseId,
  runHistoryButtons,
  setSelectValueByAnchorOption,
  waitForRunHistoryCountAtLeast,
} from './helpers.mjs'

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runCaseAddsHistoryEntryCase = {
  id: 'e2e.troubleshooting.actions.run-case-adds-run-history-entry',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run button triggers fixture run update and adds history entry',
  meta: {
    objective: 'Ensure run-case action pushes a new run entry via run-update event.',
    labels: ['ui', 'actions', 'run-case', 'edge'],
    investigationHints: [
      'Fixture API emits troubleshooting:run-update; panel should prepend run.',
      'Busy state should reset for non-running result status.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const beforeCount = await runHistoryButtons(page).count()

    const runButton = page.getByRole('button', { name: /^Run$/ }).first()
    await runButton.waitFor({ state: 'visible' })
    await runButton.click()

    await page.waitForFunction(
      (expectedMin) => {
        const buttons = document.querySelectorAll('[data-testid="run-history-item"]')
        return buttons.length >= expectedMin
      },
      beforeCount + 1
    )

    const afterCount = await runHistoryButtons(page).count()
    assert.equal(afterCount >= beforeCount + 1, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runAllDisabledPlannedOnlyCase = {
  id: 'e2e.troubleshooting.actions.run-all-disabled-for-planned-only-workflow',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run All Runnable is disabled for planned-only workflow',
  meta: {
    objective: 'Ensure run-all guard prevents execution when no runnable cases exist.',
    labels: ['ui', 'actions', 'run-all', 'planned'],
    investigationHints: [
      'Upload-local fixture has planned-only case set (implemented=false).',
      'Button disabled state should track filtered runnable count.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, 'upload-local')
    await page.getByText('fixture.case.upload.planned-only').waitFor({ state: 'visible' })
    const runAllButton = page.getByRole('button', { name: 'Run All Runnable' })
    assert.equal(await runAllButton.isDisabled(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const clearLogsCase = {
  id: 'e2e.troubleshooting.actions.clear-logs-resets-run-panels',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Clear Logs empties run history and resets run details',
  meta: {
    objective: 'Verify clear-runs action resets list and selected run state.',
    labels: ['ui', 'actions', 'clear-logs', 'edge'],
    investigationHints: [
      'After clear, run history should show empty message.',
      'Run details should revert to "No run selected".',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const clearButton = page.getByRole('button', { name: 'Clear Logs' })
    await clearButton.waitFor({ state: 'visible' })
    await clearButton.click()

    await page.getByText('No runs for this workflow/version.').waitFor({ state: 'visible' })
    await page.getByText('No run selected.').waitFor({ state: 'visible' })

    const historyCount = await runHistoryButtons(page).count()
    assert.equal(historyCount, 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runAllAddsMultipleRunsCase = {
  id: 'e2e.troubleshooting.actions.run-all-runnable-adds-multiple-runs',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run All Runnable executes filtered runnable cases and appends multiple run records',
  meta: {
    objective: 'Ensure Run All triggers every runnable case in current workflow/version scope.',
    labels: ['ui', 'actions', 'run-all', 'edge'],
    investigationHints: [
      'Scope to tiktok-repost v2.0 (2 runnable cases in fixture).',
      'Run history should grow by at least filtered runnable case count.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Workflows', 'tiktok-repost'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Versions', '2.0'), true)

    const beforeCount = await runHistoryButtons(page).count()
    const runAllButton = page.getByRole('button', { name: 'Run All Runnable' })
    await runAllButton.waitFor({ state: 'visible' })
    assert.equal(await runAllButton.isDisabled(), false)
    await runAllButton.click()

    await waitForRunHistoryCountAtLeast(page, beforeCount + 2)
    const afterCount = await runHistoryButtons(page).count()
    assert.equal(afterCount >= beforeCount + 2, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const plannedCaseButtonDisabledCase = {
  id: 'e2e.troubleshooting.actions.planned-case-run-button-disabled',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Planned-only case keeps Run button disabled with Planned label',
  meta: {
    objective: 'Ensure non-implemented cases cannot be executed manually.',
    labels: ['ui', 'actions', 'planned', 'guard'],
    investigationHints: [
      'Open upload-local workflow where fixture case is planned only.',
      'Run button should display Planned and remain disabled.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, 'upload-local')
    await page.getByText('fixture.case.upload.planned-only').waitFor({ state: 'visible' })
    const runButton = page.getByRole('button', { name: /^Planned$/ }).first()
    await runButton.waitFor({ state: 'visible' })
    assert.equal(await runButton.isDisabled(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runAllEnabledWhenRunnableCase = {
  id: 'e2e.troubleshooting.actions.run-all-enabled-when-runnable-exists',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run All Runnable is enabled when filtered scope has runnable cases',
  meta: {
    objective: 'Verify run-all disabled guard does not block runnable workflows.',
    labels: ['ui', 'actions', 'run-all', 'guard'],
    investigationHints: [
      'Scope to main workflow with runnable fixture cases.',
      'Run All Runnable should be enabled.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, 'main')
    const runAllButton = page.getByRole('button', { name: 'Run All Runnable' })
    await runAllButton.waitFor({ state: 'visible' })
    assert.equal(await runAllButton.isDisabled(), false)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const refreshMaintainsRunHistoryCase = {
  id: 'e2e.troubleshooting.actions.refresh-maintains-run-history',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Refresh reload keeps run history count in sync with provider state',
  meta: {
    objective: 'Ensure refresh action reloads from provider without dropping run history unexpectedly.',
    labels: ['ui', 'actions', 'refresh', 'edge'],
    investigationHints: [
      'Capture current visible run-history count, click Refresh, compare count.',
      'Fixture provider keeps in-memory run state so count should stay stable.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const beforeCount = await runHistoryButtons(page).count()
    const refreshButton = page.getByRole('button', { name: 'Refresh' })
    await refreshButton.waitFor({ state: 'visible' })
    await refreshButton.click()
    await page.getByRole('button', { name: 'Refresh' }).waitFor({ state: 'visible' })
    const afterCount = await runHistoryButtons(page).count()
    assert.equal(afterCount, beforeCount)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runCaseFailureMessageCase = {
  id: 'e2e.troubleshooting.actions.run-case-failure-shows-error-message',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run case failure shows error message banner and clears busy state',
  meta: {
    objective: 'Ensure run-case IPC failure is surfaced to users and does not leave the case stuck in running state.',
    labels: ['ui', 'actions', 'run-case', 'error'],
    investigationHints: [
      'Injected failure path uses troubleshooting:test:set-behavior -> failRunCase.',
      'Run button should go back to "Run" after error.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await page.evaluate(() => window.api.invoke('troubleshooting:test:set-behavior', { failRunCase: true }))
    const runButton = runCaseButtonByCaseId(page, 'fixture.case.e2e.publish-path')
    await runButton.waitFor({ state: 'visible' })
    await runButton.click()

    const errorBanner = page.getByText('Run failed: Injected run-case failure')
    await errorBanner.waitFor({ state: 'visible' })
    assert.equal(await errorBanner.isVisible(), true)
    assert.equal(await runButton.textContent(), 'Run')
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const clearLogsFailureMessageCase = {
  id: 'e2e.troubleshooting.actions.clear-logs-failure-shows-error-message',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Clear Logs failure shows error message banner',
  meta: {
    objective: 'Ensure clear-runs IPC failure is visible to user.',
    labels: ['ui', 'actions', 'clear-logs', 'error'],
    investigationHints: [
      'Injected failure path uses troubleshooting:test:set-behavior -> failClearRuns.',
      'Run history should remain unchanged after failed clear.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const beforeCount = await runHistoryButtons(page).count()
    await page.evaluate(() => window.api.invoke('troubleshooting:test:set-behavior', { failClearRuns: true }))
    const clearButton = page.getByRole('button', { name: 'Clear Logs' })
    await clearButton.waitFor({ state: 'visible' })
    await clearButton.click()

    const errorBanner = page.getByText('Clear failed: Injected clear-runs failure')
    await errorBanner.waitFor({ state: 'visible' })
    assert.equal(await errorBanner.isVisible(), true)
    assert.equal(await runHistoryButtons(page).count(), beforeCount)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const refreshLoadFailureMessageCase = {
  id: 'e2e.troubleshooting.actions.refresh-load-failure-shows-error-message',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Refresh shows load error when case catalog fetch fails',
  meta: {
    objective: 'Ensure load() errors are surfaced in top error banner.',
    labels: ['ui', 'actions', 'refresh', 'error'],
    investigationHints: [
      'Injected failure path uses troubleshooting:test:set-behavior -> failListCases.',
      'Refresh should keep panel interactive after error.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await page.evaluate(() => window.api.invoke('troubleshooting:test:set-behavior', { failListCases: true }))
    const refreshButton = page.getByRole('button', { name: 'Refresh' })
    await refreshButton.waitFor({ state: 'visible' })
    await refreshButton.click()

    const errorBanner = page.getByText('Load failed: Injected list-cases failure')
    await errorBanner.waitFor({ state: 'visible' })
    assert.equal(await errorBanner.isVisible(), true)
  },
}

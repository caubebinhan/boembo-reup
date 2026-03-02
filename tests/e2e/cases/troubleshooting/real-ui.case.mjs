import {
  clickWorkflowCatalogCard,
  getSelectOptionValuesByAnchorOption,
  getSelectStateByAnchorOption,
  resetWorkflowVersionFilters,
  runCaseButtonByCaseId,
  runHistoryButtons,
  setManualRuntimePickersEnabled,
  setSelectValueByAnchorOption,
  waitForRunHistoryCountAtLeast,
} from './helpers.mjs'

const MAIN_WORKFLOW_ID = 'main'
const TIKTOK_WORKFLOW_ID = 'tiktok-repost'
const MAIN_PLANNED_CASE_ID = 'e2e.troubleshooting.suites.grouping-visible'
const SAFE_RUN_CASE_ID = 'tiktok-repost-v1.debug-panel.workflow-filter-smoke'
const SAFE_RUN_CASE_TITLE = 'Debug Panel Workflow/Version Filter Smoke'
const TIKTOK_CASE_MARKER = 'tiktok-repost-v1.campaign.create-smoke'

/**
 * @param {import('../types.mjs').E2ECaseContext} ctx
 */
async function runSafeCaseAndSelect(ctx) {
  const { page, assert } = ctx

  await resetWorkflowVersionFilters(page)
  await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)

  const runButton = runCaseButtonByCaseId(page, SAFE_RUN_CASE_ID)
  await runButton.waitFor({ state: 'visible' })
  assert.equal(await runButton.isDisabled(), false)

  const beforeCount = await runHistoryButtons(page).count()
  await runButton.click()
  await waitForRunHistoryCountAtLeast(page, beforeCount + 1)

  const runItem = runHistoryButtons(page).filter({ hasText: SAFE_RUN_CASE_TITLE }).first()
  await runItem.waitFor({ state: 'visible' })
  await runItem.click()
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const panelLoadsRealCatalogCase = {
  id: 'e2e.troubleshooting.real-ui.panel-loads-real-catalog',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Troubleshooting panel loads real catalog/suites in Electron app',
  meta: {
    objective: 'Verify panel loads from real IPC providers and renders grouped suites with runnable buttons.',
    labels: ['ui', 'real-app', 'catalog', 'suite-grouping'],
    investigationHints: [
      'This case should fail if test harness still uses mocked window.api.',
      'Validate at least one runnable button is rendered from real case definitions.',
    ],
  },
  run: async ({ page, assert }) => {
    await page.getByText('Workflow Catalog').waitFor({ state: 'visible' })
    await page.getByText('Test Cases').waitFor({ state: 'visible' })

    const suiteHeadings = await page.locator('[data-suite-heading]').allTextContents()
    assert.equal(suiteHeadings.some((label) => /E2E/i.test(label)), true)
    assert.equal(suiteHeadings.some((label) => /Integration/i.test(label)), true)
    assert.equal(suiteHeadings.some((label) => /Unit/i.test(label)), true)
    assert.equal(await page.locator('[data-testid="run-case-button"]').count() > 0, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowCatalogCase = {
  id: 'e2e.troubleshooting.real-ui.workflow.catalog-shows-real-workflows',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow catalog shows real providers (main + tiktok-repost)',
  meta: {
    objective: 'Ensure workflow cards are sourced from real provider summaries and include expected workflows.',
    labels: ['ui', 'workflow', 'real-app', 'catalog'],
    investigationHints: [
      'Expected providers in this repo are main@1.0 and tiktok-repost@1.0.',
      'Workflow cards are rendered with data-testid=workflow-card.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await page.locator(`[data-testid="workflow-card"][data-workflow-id="${MAIN_WORKFLOW_ID}"]`).first().waitFor({ state: 'visible' })
    await page.locator(`[data-testid="workflow-card"][data-workflow-id="${TIKTOK_WORKFLOW_ID}"]`).first().waitFor({ state: 'visible' })

    const cardCount = await page.locator('[data-testid="workflow-card"]').count()
    assert.equal(cardCount >= 2, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowSelectOptionsCase = {
  id: 'e2e.troubleshooting.real-ui.workflow.select-options-sync-with-real-catalog',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow select options stay synced with real catalog',
  meta: {
    objective: 'Ensure workflow dropdown options include expected real provider ids.',
    labels: ['ui', 'workflow', 'select', 'real-app'],
    investigationHints: [
      'All Workflows option must exist.',
      'main and tiktok-repost should be present in select options.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const options = await getSelectOptionValuesByAnchorOption(page, 'All Workflows')
    const values = options.map((option) => option.value)
    assert.equal(values.includes('all'), true)
    assert.equal(values.includes(MAIN_WORKFLOW_ID), true)
    assert.equal(values.includes(TIKTOK_WORKFLOW_ID), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runHistoryAndDetailsEmptyStateCase = {
  id: 'e2e.troubleshooting.real-ui.run-history.empty-state-visible-before-first-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run history and details show empty states before first run',
  meta: {
    objective: 'Ensure default run panes are empty in a fresh isolated DB session.',
    labels: ['ui', 'run-history', 'run-details', 'empty-state'],
    investigationHints: [
      'A fresh app launch should not preload stale troubleshooting runs.',
      'Both run-list and run-details empty messages should be visible.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await page.getByText('No runs for this workflow/version.').waitFor({ state: 'visible' })
    await page.getByText('No run selected.').waitFor({ state: 'visible' })
    assert.equal(await runHistoryButtons(page).count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowCardSelectionSyncsFilterInputsCase = {
  id: 'e2e.troubleshooting.real-ui.workflow.card-selection-syncs-filter-inputs',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow card selection stays in sync with dropdown filters',
  meta: {
    objective: 'Ensure clicking workflow cards updates workflow/version selects consistently.',
    labels: ['ui', 'workflow', 'filter', 'sync'],
    investigationHints: [
      'Click main then tiktok-repost cards and validate select values.',
      'Version dropdown should reset to all after card-based workflow switch.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)

    await clickWorkflowCatalogCard(page, MAIN_WORKFLOW_ID)
    const mainWorkflowState = await getSelectStateByAnchorOption(page, 'All Workflows')
    const mainVersionState = await getSelectStateByAnchorOption(page, 'All Versions')
    assert.ok(mainWorkflowState)
    assert.ok(mainVersionState)
    assert.equal(mainWorkflowState.value, MAIN_WORKFLOW_ID)
    assert.equal(mainVersionState.value, 'all')

    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)
    const tiktokWorkflowState = await getSelectStateByAnchorOption(page, 'All Workflows')
    const tiktokVersionState = await getSelectStateByAnchorOption(page, 'All Versions')
    assert.ok(tiktokWorkflowState)
    assert.ok(tiktokVersionState)
    assert.equal(tiktokWorkflowState.value, TIKTOK_WORKFLOW_ID)
    assert.equal(tiktokVersionState.value, 'all')
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowCardFilterCase = {
  id: 'e2e.troubleshooting.real-ui.workflow.filter-by-card-updates-case-scope',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow card filter scopes case list using real definitions',
  meta: {
    objective: 'Verify workflow-card quick filter updates case scope in real app data.',
    labels: ['ui', 'workflow', 'filter', 'real-app'],
    investigationHints: [
      'Filter to main should hide tiktok-specific case ids.',
      'Filter to tiktok-repost should hide main external mirror case id.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, MAIN_WORKFLOW_ID)
    await page.getByText(MAIN_PLANNED_CASE_ID).waitFor({ state: 'visible' })
    assert.equal(await page.getByText(TIKTOK_CASE_MARKER).count(), 0)

    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)
    await page.getByText(TIKTOK_CASE_MARKER).waitFor({ state: 'visible' })
    assert.equal(await page.getByText(MAIN_PLANNED_CASE_ID).count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const versionSelectOptionsCase = {
  id: 'e2e.troubleshooting.real-ui.workflow.version-select-has-default-options',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Version select includes all + 1.0 options',
  meta: {
    objective: 'Validate minimum version filter options are present for real catalog.',
    labels: ['ui', 'workflow', 'version', 'real-app'],
    investigationHints: [
      'All Versions should always exist.',
      'Current repo providers should expose version 1.0.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const options = await getSelectOptionValuesByAnchorOption(page, 'All Versions')
    const values = options.map((option) => option.value)
    assert.equal(values.includes('all'), true)
    assert.equal(values.includes('1.0'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const filterSummaryReflectsSelectionsCase = {
  id: 'e2e.troubleshooting.real-ui.workflow.filter-summary-reflects-selections',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Filter summary text reflects selected workflow/version',
  meta: {
    objective: 'Ensure filter banner is aligned with dropdown selections.',
    labels: ['ui', 'workflow', 'version', 'summary'],
    investigationHints: [
      'Set workflow=tiktok-repost and version=1.0, then verify summary line.',
      'Reset to all/all and verify fallback labels.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Workflows', TIKTOK_WORKFLOW_ID), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Versions', '1.0'), true)

    const scopedText = (await page.locator('div:has-text("Filter:")').first().textContent()) || ''
    assert.equal(scopedText.includes(TIKTOK_WORKFLOW_ID), true)
    assert.equal(scopedText.includes('v1.0'), true)

    await resetWorkflowVersionFilters(page)
    const allText = (await page.locator('div:has-text("Filter:")').first().textContent()) || ''
    assert.equal(allText.includes('all workflows'), true)
    assert.equal(allText.includes('all versions'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runAllDisabledForPlannedOnlyWorkflowCase = {
  id: 'e2e.troubleshooting.real-ui.actions.run-all-disabled-for-main-planned-only',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run All Runnable is disabled for main planned-only workflow',
  meta: {
    objective: 'Ensure run-all guard blocks execution when selected scope has no runnable cases.',
    labels: ['ui', 'actions', 'run-all', 'guard'],
    investigationHints: [
      'main workflow in this repo is catalog mirror and planned-only.',
      'Run All Runnable should stay disabled.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, MAIN_WORKFLOW_ID)
    const runAllButton = page.getByRole('button', { name: 'Run All Runnable' })
    await runAllButton.waitFor({ state: 'visible' })
    assert.equal(await runAllButton.isDisabled(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runAllEnabledForRunnableWorkflowCase = {
  id: 'e2e.troubleshooting.real-ui.actions.run-all-enabled-for-runnable-workflow',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run All Runnable is enabled for tiktok-repost workflow',
  meta: {
    objective: 'Verify run-all action is available when runnable cases exist.',
    labels: ['ui', 'actions', 'run-all', 'real-app'],
    investigationHints: [
      'Select tiktok-repost workflow via card.',
      'Run All Runnable should be enabled.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)
    const runAllButton = page.getByRole('button', { name: 'Run All Runnable' })
    await runAllButton.waitFor({ state: 'visible' })
    assert.equal(await runAllButton.isDisabled(), false)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersWarningCase = {
  id: 'e2e.troubleshooting.real-ui.manual-pickers.warning-when-unscoped',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual pickers show warning and stay disabled when workflow is unscoped',
  meta: {
    objective: 'Ensure manual runtime controls require workflow scope.',
    labels: ['ui', 'manual-pickers', 'guard', 'workflow-scope'],
    investigationHints: [
      'Enable Manual Runtime Pickers while workflow=all.',
      'Warning banner should be visible and pickers disabled.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await setManualRuntimePickersEnabled(page, true)
    await page.getByText('Manual runtime pickers are enabled. Select a specific workflow').waitFor({ state: 'visible' })

    const accountState = await getSelectStateByAnchorOption(page, 'Debug Account: Auto Select')
    const videoState = await getSelectStateByAnchorOption(page, 'Debug Video (select workflow): Auto Select')
    const sourceState = await getSelectStateByAnchorOption(page, 'Debug Source (select workflow): Auto Random')
    assert.ok(accountState)
    assert.ok(videoState)
    assert.ok(sourceState)
    assert.equal(accountState.disabled, true)
    assert.equal(videoState.disabled, true)
    assert.equal(sourceState.disabled, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersScopedEnabledCase = {
  id: 'e2e.troubleshooting.real-ui.manual-pickers.enabled-when-workflow-scoped',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual pickers become enabled when workflow is scoped',
  meta: {
    objective: 'Ensure manual runtime controls become interactive after selecting a concrete workflow.',
    labels: ['ui', 'manual-pickers', 'workflow-scope', 'real-app'],
    investigationHints: [
      'Enable manual pickers first.',
      'Select tiktok-repost and verify warning disappears + controls enabled.',
    ],
  },
  run: async ({ page, assert }) => {
    await setManualRuntimePickersEnabled(page, true)
    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)

    assert.equal(await page.getByText('Manual runtime pickers are enabled. Select a specific workflow').count(), 0)

    const accountState = await getSelectStateByAnchorOption(page, 'Debug Account: Auto Select')
    const videoState = await getSelectStateByAnchorOption(page, 'Debug Video (tiktok-repost): Auto Select')
    const sourceState = await getSelectStateByAnchorOption(page, 'Debug Source (tiktok-repost): Auto Random')
    assert.ok(accountState)
    assert.ok(videoState)
    assert.ok(sourceState)
    assert.equal(accountState.disabled, false)
    assert.equal(videoState.disabled, false)
    assert.equal(sourceState.disabled, false)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersScopedDisabledWhenToggleOffCase = {
  id: 'e2e.troubleshooting.real-ui.manual-pickers.scoped-disabled-when-toggle-off',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual pickers stay disabled when toggle is off (even when scoped)',
  meta: {
    objective: 'Ensure manual control toggle remains authoritative after workflow scoping.',
    labels: ['ui', 'manual-pickers', 'guard', 'toggle'],
    investigationHints: [
      'Scope to tiktok-repost and force manual picker toggle off.',
      'Account/video/source selects should remain disabled and warning hidden.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)
    await setManualRuntimePickersEnabled(page, true)
    await setManualRuntimePickersEnabled(page, false)

    const accountState = await getSelectStateByAnchorOption(page, 'Debug Account: Auto Select')
    const videoState = await getSelectStateByAnchorOption(page, 'Debug Video (tiktok-repost): Auto Select')
    const sourceState = await getSelectStateByAnchorOption(page, 'Debug Source (tiktok-repost): Auto Random')
    assert.ok(accountState)
    assert.ok(videoState)
    assert.ok(sourceState)
    assert.equal(accountState.disabled, true)
    assert.equal(videoState.disabled, true)
    assert.equal(sourceState.disabled, true)
    assert.equal(await page.getByText('Manual runtime pickers are enabled. Select a specific workflow').count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const autoRandomSeedSummaryVisibleCase = {
  id: 'e2e.troubleshooting.real-ui.manual-pickers.seed-summary-visible-when-scoped',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Auto random seed summary appears when workflow is scoped',
  meta: {
    objective: 'Ensure random-seed audit line is rendered for scoped workflow runs.',
    labels: ['ui', 'manual-pickers', 'seed', 'summary'],
    investigationHints: [
      'Scope workflow to tiktok-repost and fill seed input.',
      'Summary block should display workflow-scoped seed value.',
    ],
  },
  run: async ({ page, assert }) => {
    await setManualRuntimePickersEnabled(page, false)
    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)

    await page.getByPlaceholder('Auto Random Seed (optional)').fill('seed-real-ui-e2e')
    const summaryLine = page.locator(`div:has-text("Auto random seed (${TIKTOK_WORKFLOW_ID}):")`).first()
    await summaryLine.waitFor({ state: 'visible' })

    const text = (await summaryLine.textContent()) || ''
    assert.equal(text.includes('seed-real-ui-e2e'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const refreshKeepsPanelInteractiveCase = {
  id: 'e2e.troubleshooting.real-ui.actions.refresh-keeps-catalog-interactive',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Refresh reload keeps case catalog interactive',
  meta: {
    objective: 'Ensure refresh does not break panel state or hide runnable cases.',
    labels: ['ui', 'actions', 'refresh', 'real-app'],
    investigationHints: [
      'Scope to tiktok-repost and ensure known case marker is visible.',
      'After refresh, same case marker and run button should remain visible.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)
    await page.getByText(TIKTOK_CASE_MARKER).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await page.getByText(TIKTOK_CASE_MARKER).waitFor({ state: 'visible' })
    assert.equal(await runCaseButtonByCaseId(page, SAFE_RUN_CASE_ID).isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const plannedCaseButtonDisabledCase = {
  id: 'e2e.troubleshooting.real-ui.actions.planned-case-run-button-disabled',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Planned case keeps Run button disabled',
  meta: {
    objective: 'Ensure non-implemented cases are visible but not executable in real app mode.',
    labels: ['ui', 'actions', 'planned', 'guard'],
    investigationHints: [
      'main workflow includes external mirror planned cases.',
      'Planned button should remain disabled.',
    ],
  },
  run: async ({ page, assert }) => {
    assert.equal(await setSelectValueByAnchorOption(page, 'All Workflows', MAIN_WORKFLOW_ID), true)
    const plannedButton = runCaseButtonByCaseId(page, MAIN_PLANNED_CASE_ID)
    await plannedButton.waitFor({ state: 'visible' })
    assert.equal(await plannedButton.isDisabled(), true)
    assert.equal(((await plannedButton.textContent()) || '').includes('Planned'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runHistoryScopedByWorkflowCase = {
  id: 'e2e.troubleshooting.real-ui.run-history.scopes-by-workflow-filter',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run history list is scoped by workflow filter',
  meta: {
    objective: 'Ensure run history visibility follows current workflow scope.',
    labels: ['ui', 'run-history', 'workflow-filter', 'real-app'],
    investigationHints: [
      'Create a run in tiktok-repost scope.',
      'Switch to main and expect empty run list; switch back and expect run visible again.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    await runHistoryButtons(page).filter({ hasText: SAFE_RUN_CASE_TITLE }).first().waitFor({ state: 'visible' })
    await clickWorkflowCatalogCard(page, MAIN_WORKFLOW_ID)
    await page.getByText('No runs for this workflow/version.').waitFor({ state: 'visible' })

    await clickWorkflowCatalogCard(page, TIKTOK_WORKFLOW_ID)
    assert.equal(await runHistoryButtons(page).filter({ hasText: SAFE_RUN_CASE_TITLE }).count() > 0, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runCaseAddsHistoryEntryCase = {
  id: 'e2e.troubleshooting.real-ui.actions.run-safe-case-adds-run-history-entry',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Running a safe real case appends run history and summary',
  meta: {
    objective: 'Run a deterministic safe case via real IPC and verify run history + selected run details update.',
    labels: ['ui', 'actions', 'run-case', 'real-app'],
    investigationHints: [
      'Uses tiktok-repost-v1.debug-panel.workflow-filter-smoke as stable runnable case.',
      'Selected run summary should include the case id.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    const historyCount = await runHistoryButtons(page).count()
    assert.equal(historyCount >= 1, true)

    const caseLine = page.locator(`div:has-text("Case:"):has-text("${SAFE_RUN_CASE_ID}")`).first()
    await caseLine.waitFor({ state: 'visible' })
    assert.equal(await caseLine.isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runHistoryStatusChipPassedCase = {
  id: 'e2e.troubleshooting.real-ui.run-history.status-chip-shows-passed-after-safe-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Safe run shows passed status chip in run history and details',
  meta: {
    objective: 'Verify status propagation from run result to run-history and details panes.',
    labels: ['ui', 'run-history', 'run-details', 'status'],
    investigationHints: [
      'Execute safe case and inspect selected run row text.',
      'Expected status label is passed.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    const runItem = runHistoryButtons(page).filter({ hasText: SAFE_RUN_CASE_TITLE }).first()
    const rowText = (await runItem.textContent()) || ''
    assert.equal(rowText.toLowerCase().includes('passed'), true)

    const detailStatusChip = page.locator('span').filter({ hasText: /^passed$/i }).first()
    assert.equal(await detailStatusChip.isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runDetailsSectionsVisibleAfterRunCase = {
  id: 'e2e.troubleshooting.real-ui.run-details.sections-visible-after-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run details show summary/meta/artifacts/footprint/result sections after run',
  meta: {
    objective: 'Ensure key run details sections render for a completed real run.',
    labels: ['ui', 'run-details', 'sections', 'real-app'],
    investigationHints: [
      'Run a safe case and open selected run details.',
      'Verify main section headers are all visible.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    await page.getByText('Summary', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Case Meta', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Artifacts', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('AI Debug Footprint', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Result Payload', { exact: true }).waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('button', { name: 'View Full Log' }).isVisible(), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runDetailsSummaryFingerprintsAndPathsCase = {
  id: 'e2e.troubleshooting.real-ui.run-details.summary-shows-fingerprints-and-debug-paths',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run summary shows case/run fingerprints and debug file paths',
  meta: {
    objective: 'Ensure summary section exposes key forensic IDs and persisted debug file references.',
    labels: ['ui', 'run-details', 'fingerprint', 'artifact-path'],
    investigationHints: [
      'Run safe case and inspect Summary section text lines.',
      'Case FP/Run FP + Artifact Manifest/Footprint File lines should be visible.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    await page.locator('div:has-text("Case FP:")').first().waitFor({ state: 'visible' })
    await page.locator('div:has-text("Run FP:")').first().waitFor({ state: 'visible' })
    await page.locator('div:has-text("Artifact Manifest:")').first().waitFor({ state: 'visible' })
    await page.locator('div:has-text("Footprint File:")').first().waitFor({ state: 'visible' })

    const manifestLine = (await page.locator('div:has-text("Artifact Manifest:")').first().textContent()) || ''
    const footprintLine = (await page.locator('div:has-text("Footprint File:")').first().textContent()) || ''
    assert.equal(manifestLine.toLowerCase().includes('artifact-manifest.json'), true)
    assert.equal(footprintLine.toLowerCase().includes('.json'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runDetailsFootprintStatsCase = {
  id: 'e2e.troubleshooting.real-ui.footprint.stats-visible-for-safe-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Footprint panel shows schema/duration/error-warn counters for safe run',
  meta: {
    objective: 'Validate summary metrics row renders from diagnostic footprint payload.',
    labels: ['ui', 'footprint', 'metrics', 'run-details'],
    investigationHints: [
      'Run safe case and inspect AI Debug Footprint metrics row.',
      'Row should include schema, duration, errors, and warns fields.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    const metrics = page.locator('div:has-text("schema=")').first()
    await metrics.waitFor({ state: 'visible' })
    const text = (await metrics.textContent()) || ''
    assert.equal(text.includes('schema='), true)
    assert.equal(text.includes('duration='), true)
    assert.equal(text.includes('errors='), true)
    assert.equal(text.includes('warns='), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runDetailsLogStatsVisibleCase = {
  id: 'e2e.troubleshooting.real-ui.logs.stats-and-lines-visible-after-safe-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run details logs show counters and non-empty timeline after safe run',
  meta: {
    objective: 'Ensure logs pane reflects stored run logs and counters for selected run.',
    labels: ['ui', 'logs', 'run-details', 'metrics'],
    investigationHints: [
      'Run safe case and inspect Logs summary line.',
      'No empty-log message should be rendered for this run.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    const statsLine = page.locator('div:has-text("Logs: total=")').first()
    await statsLine.waitFor({ state: 'visible' })
    const text = (await statsLine.textContent()) || ''
    assert.equal(text.includes('info='), true)
    assert.equal(text.includes('warn='), true)
    assert.equal(text.includes('error='), true)
    assert.equal(await page.getByText('No logs recorded.').count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const runDetailsResultPayloadCase = {
  id: 'e2e.troubleshooting.real-ui.run-details.result-payload-includes-case-params',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Result payload includes caseId and workflow params',
  meta: {
    objective: 'Ensure run result payload carries case/workflow context fields for debugging.',
    labels: ['ui', 'run-details', 'result-payload', 'real-app'],
    investigationHints: [
      'Payload should include params.caseId/workflowId/workflowVersion from case envelope.',
      'Validate values for safe run case.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    const payloadPre = page.locator('pre').filter({ hasText: `"caseId": "${SAFE_RUN_CASE_ID}"` }).first()
    await payloadPre.waitFor({ state: 'visible' })
    const text = (await payloadPre.textContent()) || ''
    assert.equal(text.includes(`"caseId": "${SAFE_RUN_CASE_ID}"`), true)
    assert.equal(text.includes(`"workflowId": "${TIKTOK_WORKFLOW_ID}"`), true)
    assert.equal(text.includes('"workflowVersion": "1.0"'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const fullLogModalOpenCloseCase = {
  id: 'e2e.troubleshooting.real-ui.logs.full-log-modal-open-close',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Full log modal opens with run context and closes cleanly',
  meta: {
    objective: 'Validate full-log modal lifecycle on a real run.',
    labels: ['ui', 'logs', 'modal', 'real-app'],
    investigationHints: [
      'Open modal from run details.',
      'Header should include selected case id.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    await page.getByRole('button', { name: 'View Full Log' }).click()
    await page.getByText('Full Run Log').waitFor({ state: 'visible' })
    const headerText = (await page.locator('p.text-xs.text-gray-400.font-mono').first().textContent()) || ''
    assert.equal(headerText.includes(SAFE_RUN_CASE_ID), true)
    await page.getByRole('button', { name: 'Close' }).click()
    assert.equal(await page.getByText('Full Run Log').count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const fullLogModalSnapshotContextCase = {
  id: 'e2e.troubleshooting.real-ui.logs.full-log-modal-snapshot-has-run-context',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Full log modal snapshot includes selected run context fields',
  meta: {
    objective: 'Verify modal run snapshot JSON includes case id and status context for handoff.',
    labels: ['ui', 'logs', 'modal', 'snapshot'],
    investigationHints: [
      'Open full-log modal after safe run selection.',
      'Run Snapshot JSON should contain selected caseId and passed status.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    await page.getByRole('button', { name: 'View Full Log' }).click()
    const modal = page.locator('div.fixed.inset-0.z-50').first()
    await modal.getByText('Full Run Log').waitFor({ state: 'visible' })

    const snapshotText = (await modal.locator('pre').last().textContent()) || ''
    assert.equal(snapshotText.includes(`"caseId": "${SAFE_RUN_CASE_ID}"`), true)
    assert.equal(snapshotText.includes('"status": "passed"'), true)

    await page.getByRole('button', { name: 'Close' }).click()
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const sentryActionHiddenForPassedRunCase = {
  id: 'e2e.troubleshooting.real-ui.run-details.sentry-action-hidden-for-non-failed-run',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Send To Sentry action is hidden for non-failed run',
  meta: {
    objective: 'Ensure Sentry action is only exposed for failed runs.',
    labels: ['ui', 'run-details', 'sentry', 'guard'],
    investigationHints: [
      'Run a safe case and inspect run details actions.',
      'Send To Sentry button should not be rendered.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)
    assert.equal(await page.getByRole('button', { name: 'Send To Sentry' }).count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const clearLogsResetsRunPanelsCase = {
  id: 'e2e.troubleshooting.real-ui.actions.clear-logs-resets-run-panels',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Clear Logs empties run history and selected run details',
  meta: {
    objective: 'Ensure clear-runs IPC works against real DB-backed run storage.',
    labels: ['ui', 'actions', 'clear-logs', 'real-app'],
    investigationHints: [
      'Run one safe case first, then clear.',
      'Expect No runs + No run selected empty states.',
    ],
  },
  run: async (ctx) => {
    const { page, assert } = ctx
    await runSafeCaseAndSelect(ctx)

    const clearButton = page.getByRole('button', { name: 'Clear Logs' })
    await clearButton.waitFor({ state: 'visible' })
    await clearButton.click()

    await page.getByText('No runs for this workflow/version.').waitFor({ state: 'visible' })
    await page.getByText('No run selected.').waitFor({ state: 'visible' })
    assert.equal(await runHistoryButtons(page).count(), 0)
  },
}

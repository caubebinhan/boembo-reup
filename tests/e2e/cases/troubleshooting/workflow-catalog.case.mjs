import {
  clickWorkflowCatalogCard,
  getSelectOptionValuesByAnchorOption,
  getSelectStateByAnchorOption,
  resetWorkflowVersionFilters,
  setSelectValueByAnchorOption,
} from './helpers.mjs'

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowCatalogCase = {
  id: 'e2e.troubleshooting.workflow.catalog-multi-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow catalog renders dynamic workflows + versions',
  meta: {
    objective: 'Verify dynamic workflow discovery appears in catalog and version aggregation is visible.',
    labels: ['ui', 'workflow', 'catalog', 'dynamic'],
    investigationHints: [
      'Check workflowOptions aggregation logic in TroubleShottingPanel.',
      'Verify version set is merged by workflow id.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await page.getByText('Workflow Catalog').waitFor()

    const workflowCountLabel = page.getByText('3 workflow(s)')
    await workflowCountLabel.waitFor({ state: 'visible' })

    await page.locator('button:has-text("main"):has-text("runnable=")').first().waitFor({ state: 'visible' })
    await page.locator('button:has-text("tiktok-repost"):has-text("runnable=")').first().waitFor({ state: 'visible' })
    await page.locator('button:has-text("upload-local"):has-text("runnable=")').first().waitFor({ state: 'visible' })

    const tiktokCardText = await page.locator('button:has-text("tiktok-repost"):has-text("versions:")').first().textContent()
    assert.ok(tiktokCardText)
    assert.equal(tiktokCardText.includes('versions: 1.0, 2.0'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowVersionOptionCase = {
  id: 'e2e.troubleshooting.workflow.version-options-follow-filter',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Version options update when workflow filter changes',
  meta: {
    objective: 'Ensure version dropdown is scoped by selected workflow.',
    labels: ['ui', 'workflow', 'version', 'filter'],
    investigationHints: [
      'If this fails, inspect versionOptions useMemo dependencies.',
      'Confirm All Workflows path keeps union of known versions.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)

    const workflowSelectSet = await setSelectValueByAnchorOption(page, 'All Workflows', 'tiktok-repost')
    assert.equal(workflowSelectSet, true)

    const tiktokVersionOptions = await page.evaluate(() => {
      const select = Array.from(document.querySelectorAll('select')).find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.trim() === 'All Versions')
      )
      if (!select) return []
      return Array.from(select.options).map((option) => option.value)
    })
    assert.equal(tiktokVersionOptions.includes('1.0'), true)
    assert.equal(tiktokVersionOptions.includes('2.0'), true)

    const resetWorkflow = await setSelectValueByAnchorOption(page, 'All Workflows', 'all')
    assert.equal(resetWorkflow, true)

    const allWorkflowVersions = await page.evaluate(() => {
      const select = Array.from(document.querySelectorAll('select')).find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.trim() === 'All Versions')
      )
      if (!select) return []
      return Array.from(select.options).map((option) => option.value)
    })
    assert.equal(allWorkflowVersions.includes('1.0'), true)
    assert.equal(allWorkflowVersions.includes('2.0'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowCardFilterCase = {
  id: 'e2e.troubleshooting.workflow.filter-by-card-updates-cases-and-runs',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow card click filters case list + run history',
  meta: {
    objective: 'Verify workflow-card shortcut applies workflow filter and updates both panes.',
    labels: ['ui', 'workflow', 'filter', 'edge'],
    investigationHints: [
      'Cross-check filteredCases and filteredRuns memo branches.',
      'Upload-local should show planned case only in fixture data.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, 'upload-local')
    await page.getByText('Filter:').waitFor({ state: 'visible' })

    const filterScope = await page.locator('div:has-text("Filter:")').first().textContent()
    assert.ok(filterScope)
    assert.equal(filterScope.includes('upload-local'), true)

    await page.getByText('fixture.case.upload.planned-only').waitFor({ state: 'visible' })
    const e2eCaseVisible = await page.locator('text=fixture.case.e2e.publish-path').count()
    assert.equal(e2eCaseVisible, 0)

    await page.getByText('No runs for this workflow/version.').waitFor({ state: 'visible' })
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const hiddenWorkflowRunPrunedCase = {
  id: 'e2e.troubleshooting.workflow.hidden-runs-pruned-from-history',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Run history prunes runs from removed workflows',
  meta: {
    objective: 'Ensure run list excludes workflow ids not present in workflow catalog.',
    labels: ['ui', 'workflow', 'run-history', 'edge'],
    investigationHints: [
      'Check existingWorkflowIds filter logic in filteredRuns.',
      'Fixture includes ghost-workflow run that should be hidden.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)

    const hiddenRunCount = await page.locator('text=Fixture Ghost Hidden Run').count()
    assert.equal(hiddenRunCount, 0)

    const visibleRunCount = await page.locator('text=Fixture Publish Failed Run').count()
    assert.equal(visibleRunCount > 0, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowSelectOptionsCase = {
  id: 'e2e.troubleshooting.workflow.select-options-sync-with-catalog',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Workflow select options stay in sync with discovered workflow catalog',
  meta: {
    objective: 'Ensure workflow dropdown options mirror dynamic catalog list.',
    labels: ['ui', 'workflow', 'select', 'dynamic'],
    investigationHints: [
      'Compare workflow select values with workflowOptions source.',
      'All Workflows option should remain available as static default.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    const options = await getSelectOptionValuesByAnchorOption(page, 'All Workflows')
    const values = options.map((option) => option.value)
    assert.equal(values.includes('all'), true)
    assert.equal(values.includes('main'), true)
    assert.equal(values.includes('tiktok-repost'), true)
    assert.equal(values.includes('upload-local'), true)
    assert.equal(values.length >= 4, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowVersionFilterCase = {
  id: 'e2e.troubleshooting.workflow.version-filter-scopes-cases-and-runs',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Version filter scopes both case list and run history',
  meta: {
    objective: 'Ensure version filter applies consistently to cases and runs for selected workflow.',
    labels: ['ui', 'workflow', 'version', 'run-history', 'edge'],
    investigationHints: [
      'Scope to tiktok-repost + version 2.0 using filter controls.',
      'v1 case/run entries should not remain visible after filter is applied.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Workflows', 'tiktok-repost'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Versions', '2.0'), true)

    await page.getByText('Fixture TikTok v2 Edge', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Fixture TikTok v2 Browser E2E', { exact: true }).waitFor({ state: 'visible' })
    assert.equal(await page.getByText('Fixture E2E Publish Path', { exact: true }).count(), 0)

    await page.locator('button.w-full.text-left.rounded-lg.border.px-3.py-2:has-text("Fixture V2 Failed Run")').first().waitFor({ state: 'visible' })
    await page.locator('button.w-full.text-left.rounded-lg.border.px-3.py-2:has-text("Fixture V2 Passed No Logs")').first().waitFor({ state: 'visible' })
    assert.equal(await page.locator('button.w-full.text-left.rounded-lg.border.px-3.py-2:has-text("Fixture Publish Failed Run")').count(), 0)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const workflowVersionResetsOnScopeChangeCase = {
  id: 'e2e.troubleshooting.workflow.version-filter-resets-when-workflow-changes',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Version filter resets to all when selected workflow does not expose current version',
  meta: {
    objective: 'Verify invalid workflow-version combo auto-resets version filter.',
    labels: ['ui', 'workflow', 'version', 'guard'],
    investigationHints: [
      'Set workflow=tiktok-repost with version=2.0, then switch workflow=main.',
      'Version filter should reset to all and remove 2.0 from available options.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Workflows', 'tiktok-repost'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Versions', '2.0'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'All Workflows', 'main'), true)

    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const versionSelect = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.trim() === 'All Versions')
      )
      return versionSelect?.value === 'all'
    })

    const versionState = await getSelectStateByAnchorOption(page, 'All Versions')
    assert.ok(versionState)
    assert.equal(versionState.value, 'all')
    assert.equal(versionState.options.some((option) => option.value === '2.0'), false)
    assert.equal(versionState.options.some((option) => option.value === '1.0'), true)
  },
}

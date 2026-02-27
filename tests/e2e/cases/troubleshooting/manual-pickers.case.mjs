import {
  clickWorkflowCatalogCard,
  getSelectStateByAnchorOption,
  resetWorkflowVersionFilters,
  setManualRuntimePickersEnabled,
  setSelectValueByAnchorOption,
} from './helpers.mjs'

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersWarningCase = {
  id: 'e2e.troubleshooting.manual-pickers-warning-no-workflow-selected',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual pickers show warning when workflow scope is all',
  meta: {
    objective: 'Ensure manual picker warning is shown when workflow is not scoped.',
    labels: ['ui', 'manual-pickers', 'workflow-scope'],
    investigationHints: [
      'Warning should appear only when manual pickers enabled and workflow=all.',
      'Check activeWorkflowScope + manualTiktokRepostPickersEnabled branch.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await setManualRuntimePickersEnabled(page, true)
    await page.getByText('Manual runtime pickers are enabled. Select a specific workflow').waitFor({ state: 'visible' })
    const warningVisible = await page.getByText('Manual runtime pickers are enabled. Select a specific workflow').isVisible()
    assert.equal(warningVisible, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersCandidateLoadCase = {
  id: 'e2e.troubleshooting.manual-pickers-load-workflow-candidates',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual pickers load workflow-scoped account/video/source candidates',
  meta: {
    objective: 'Verify candidate dropdowns populate after selecting a workflow scope.',
    labels: ['ui', 'manual-pickers', 'candidates', 'edge'],
    investigationHints: [
      'Troubleshooting panel should call list-video-candidates/list-source-candidates on scope change.',
      'Account list comes from account:list and stays available.',
    ],
  },
  run: async ({ page, assert }) => {
    await setManualRuntimePickersEnabled(page, true)
    await clickWorkflowCatalogCard(page, 'tiktok-repost')

    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const account = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Account: Auto Select'))
      )
      const video = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Video (tiktok-repost): Auto Select'))
      )
      const source = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Source (tiktok-repost): Auto Random'))
      )
      if (!account || !video || !source) return false
      return account.options.length > 1 && video.options.length > 1 && source.options.length > 1
    })

    const summary = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const account = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Account: Auto Select'))
      )
      const video = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Video (tiktok-repost): Auto Select'))
      )
      const source = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Source (tiktok-repost): Auto Random'))
      )
      return {
        accountCount: account?.options.length || 0,
        videoCount: video?.options.length || 0,
        sourceCount: source?.options.length || 0,
      }
    })

    assert.equal(summary.accountCount > 1, true)
    assert.equal(summary.videoCount > 1, true)
    assert.equal(summary.sourceCount > 1, true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersSummaryCase = {
  id: 'e2e.troubleshooting.manual-pickers-selected-summary-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual picker selections appear in runtime summary block',
  meta: {
    objective: 'Ensure selected account/video/source + random seed are surfaced for debugging auditability.',
    labels: ['ui', 'manual-pickers', 'summary', 'runtime'],
    investigationHints: [
      'If this fails, inspect summary block conditions near autoRandomSeed/manual pickers.',
      'Picker values are workflow-scoped and should include chosen fixture ids.',
    ],
  },
  run: async ({ page, assert }) => {
    await setManualRuntimePickersEnabled(page, true)
    await clickWorkflowCatalogCard(page, 'tiktok-repost')

    await page.getByPlaceholder('Auto Random Seed (optional)').fill('seed-e2e-123')
    assert.equal(await setSelectValueByAnchorOption(page, 'Debug Account: Auto Select', 'acc-fixture-1'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'Debug Video (tiktok-repost): Auto Select', 'video-fixture-1'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'Debug Source (tiktok-repost): Auto Random', 'source-fixture-1'), true)

    await page.getByText('Auto random seed (tiktok-repost):').waitFor({ state: 'visible' })
    const summaryText = await page.locator('div:has-text("Auto random seed (tiktok-repost):")').first().textContent()
    assert.ok(summaryText)
    assert.equal(summaryText.includes('seed-e2e-123'), true)
    assert.equal(summaryText.includes('fixture_alpha'), true)
    assert.equal(summaryText.includes('vid_v1_001'), true)
    assert.equal(summaryText.includes('@fixture_channel'), true)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualPickersDisabledCase = {
  id: 'e2e.troubleshooting.manual-pickers-disabled-when-toggle-off',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual picker dropdowns stay disabled when toggle is off',
  meta: {
    objective: 'Verify account/video/source selectors are disabled when manual picker mode is off.',
    labels: ['ui', 'manual-pickers', 'guard'],
    investigationHints: [
      'Even with workflow scoped, selectors must remain disabled when manual toggle is off.',
      'Warning banner should not appear while manual toggle is off.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, 'tiktok-repost')
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
export const manualPickersCandidateResetCase = {
  id: 'e2e.troubleshooting.manual-pickers-reset-video-source-on-workflow-change',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Manual video/source selection resets when switching to workflow without candidates',
  meta: {
    objective: 'Ensure stale manual video/source picks are reset when workflow scope changes.',
    labels: ['ui', 'manual-pickers', 'workflow-change', 'edge'],
    investigationHints: [
      'Select explicit video/source for tiktok-repost first, then switch to main workflow.',
      'Video/source selects should reset to auto with empty candidate options.',
    ],
  },
  run: async ({ page, assert }) => {
    await clickWorkflowCatalogCard(page, 'tiktok-repost')
    await setManualRuntimePickersEnabled(page, true)
    assert.equal(await setSelectValueByAnchorOption(page, 'Debug Video (tiktok-repost): Auto Select', 'video-fixture-1'), true)
    assert.equal(await setSelectValueByAnchorOption(page, 'Debug Source (tiktok-repost): Auto Random', 'source-fixture-1'), true)

    await clickWorkflowCatalogCard(page, 'main')
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const video = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Video (main): Auto Select'))
      )
      const source = selects.find((entry) =>
        Array.from(entry.options).some((option) => option.textContent?.includes('Debug Source (main): Auto Random'))
      )
      if (!video || !source) return false
      return video.value === 'auto' && source.value === 'auto' && video.options.length === 1 && source.options.length === 1
    })

    const videoState = await getSelectStateByAnchorOption(page, 'Debug Video (main): Auto Select')
    const sourceState = await getSelectStateByAnchorOption(page, 'Debug Source (main): Auto Random')
    assert.ok(videoState)
    assert.ok(sourceState)
    assert.equal(videoState.value, 'auto')
    assert.equal(sourceState.value, 'auto')
    assert.equal(videoState.options.length, 1)
    assert.equal(sourceState.options.length, 1)
  },
}

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const manualSeedSummaryWithoutManualPickersCase = {
  id: 'e2e.troubleshooting.manual-seed-summary-visible-without-manual-pickers',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Auto random seed summary appears even when manual pickers are off',
  meta: {
    objective: 'Ensure random seed audit line is visible for scoped workflow regardless of manual picker toggle.',
    labels: ['ui', 'manual-pickers', 'seed', 'edge'],
    investigationHints: [
      'Summary block should render if workflow scope exists and autoRandomSeed is filled.',
      'Manual picker checkbox state should not suppress seed line.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await setManualRuntimePickersEnabled(page, false)
    await clickWorkflowCatalogCard(page, 'tiktok-repost')
    await page.getByPlaceholder('Auto Random Seed (optional)').fill('seed-only-42')

    const seedText = page.getByText('Auto random seed (tiktok-repost):')
    await seedText.waitFor({ state: 'visible' })
    assert.equal(await seedText.isVisible(), true)
  },
}

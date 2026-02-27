/**
 * @param {import('playwright').Page} page
 * @param {string} anchorOptionText
 * @param {string} value
 */
export async function setSelectValueByAnchorOption(page, anchorOptionText, value) {
  const ok = await page.evaluate(({ anchorOptionText: anchor, value: nextValue }) => {
    const select = Array.from(document.querySelectorAll('select')).find((entry) =>
      Array.from(entry.options).some((option) => option.textContent?.trim() === anchor)
    )
    if (!select) return false
    if (!Array.from(select.options).some((option) => option.value === nextValue)) return false
    select.value = nextValue
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, { anchorOptionText, value })
  return ok
}

/**
 * @param {import('playwright').Page} page
 * @param {string} anchorOptionText
 */
export async function getSelectOptionValuesByAnchorOption(page, anchorOptionText) {
  return page.evaluate(({ anchorOptionText: anchor }) => {
    const select = Array.from(document.querySelectorAll('select')).find((entry) =>
      Array.from(entry.options).some((option) => option.textContent?.trim() === anchor)
    )
    if (!select) return []
    return Array.from(select.options).map((option) => ({
      value: option.value,
      text: (option.textContent || '').trim(),
      disabled: option.disabled,
    }))
  }, { anchorOptionText })
}

/**
 * @param {import('playwright').Page} page
 * @param {string} anchorOptionText
 */
export async function getSelectStateByAnchorOption(page, anchorOptionText) {
  return page.evaluate(({ anchorOptionText: anchor }) => {
    const select = Array.from(document.querySelectorAll('select')).find((entry) =>
      Array.from(entry.options).some((option) => option.textContent?.trim() === anchor)
    )
    if (!select) return null
    return {
      value: select.value,
      disabled: select.disabled,
      options: Array.from(select.options).map((option) => ({
        value: option.value,
        text: (option.textContent || '').trim(),
        disabled: option.disabled,
      })),
    }
  }, { anchorOptionText })
}

/**
 * @param {import('playwright').Page} page
 * @param {boolean} enabled
 */
export async function setManualRuntimePickersEnabled(page, enabled) {
  const checkbox = page.getByRole('checkbox', { name: 'Manual Runtime Pickers' })
  await checkbox.waitFor({ state: 'visible' })
  const checked = await checkbox.isChecked()
  if (checked !== enabled) await checkbox.click()
}

/**
 * @param {import('playwright').Page} page
 */
export async function resetWorkflowVersionFilters(page) {
  await setSelectValueByAnchorOption(page, 'All Workflows', 'all')
  await setSelectValueByAnchorOption(page, 'All Versions', 'all')
}

/**
 * @param {import('playwright').Page} page
 * @param {string} workflowId
 */
export async function clickWorkflowCatalogCard(page, workflowId) {
  const card = page.locator(`button:has-text("${workflowId}"):has-text("runnable=")`).first()
  await card.waitFor({ state: 'visible' })
  await card.click()
}

/**
 * @param {import('playwright').Page} page
 * @param {string} runTitle
 */
export async function selectRunByTitle(page, runTitle) {
  const button = page.locator(`button.w-full.text-left.rounded-lg.border.px-3.py-2:has-text("${runTitle}")`).first()
  await button.waitFor({ state: 'visible' })
  await button.click()
}

/**
 * @param {import('playwright').Page} page
 */
export function runHistoryButtons(page) {
  return page.locator('button.w-full.text-left.rounded-lg.border.px-3.py-2')
}

/**
 * @param {import('playwright').Page} page
 * @param {number} expectedMinimum
 */
export async function waitForRunHistoryCountAtLeast(page, expectedMinimum) {
  await page.waitForFunction(
    (nextMin) => {
      const buttons = document.querySelectorAll('button.w-full.text-left.rounded-lg.border.px-3.py-2')
      return buttons.length >= nextMin
    },
    expectedMinimum
  )
}

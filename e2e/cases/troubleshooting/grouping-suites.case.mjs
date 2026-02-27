/** @type {import('../types.mjs').E2ECaseDefinition} */
export const groupingSuitesCase = {
  id: 'e2e.troubleshooting.suites.grouping-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Troubleshooting panel shows E2E/Integration/Unit suite sections',
  meta: {
    objective: 'Validate grouped suite layout is visible for case triage.',
    labels: ['ui', 'grouping', 'suite'],
    investigationHints: [
      'Check case classification logic in troubleshootingPanel.helpers.',
      'Inspect rendered suite headers via data-suite-heading markers.',
    ],
  },
  run: async ({ page, assert }) => {
    const suiteHeadings = await page.locator('[data-suite-heading]').allTextContents()
    assert.equal(suiteHeadings.length >= 3, true)
    assert.equal(suiteHeadings.some(label => /E2E/i.test(label)), true)
    assert.equal(suiteHeadings.some(label => /Integration/i.test(label)), true)
    assert.equal(suiteHeadings.some(label => /Unit/i.test(label)), true)
  },
}

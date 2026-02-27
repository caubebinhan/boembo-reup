/** @type {import('../types.mjs').E2ECaseDefinition} */
export const sentryFeedbackLinksCase = {
  id: 'e2e.troubleshooting.sentry.feedback-links-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Sentry send feedback shows event and issue links',
  meta: {
    objective: 'Ensure troubleshooting panel shows Sentry verification links after sending run.',
    labels: ['ui', 'sentry', 'links'],
    investigationHints: [
      'Click Send To Sentry on a failed run and inspect the feedback block.',
      'Verify event/issue links are rendered as anchors with expected href.',
    ],
  },
  run: async ({ page, assert }) => {
    await page.getByRole('button', { name: 'Send To Sentry' }).click()
    const eventLink = page.getByRole('link', { name: 'Open Sentry Event' })
    const issueLink = page.getByRole('link', { name: 'Open Sentry Issue Search' })

    await eventLink.waitFor({ state: 'visible' })
    await issueLink.waitFor({ state: 'visible' })

    const eventHref = await eventLink.getAttribute('href')
    const issueHref = await issueLink.getAttribute('href')
    assert.ok(eventHref)
    assert.ok(issueHref)
    assert.equal(eventHref.includes('/events/'), true)
    assert.equal(issueHref.includes('/issues/?query='), true)
  },
}

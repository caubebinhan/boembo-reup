import { resetWorkflowVersionFilters, selectRunByTitle } from './helpers.mjs'

/** @type {import('../types.mjs').E2ECaseDefinition} */
export const screenshotPreviewCase = {
  id: 'e2e.troubleshooting.artifact.screenshot-preview-visible',
  suite: 'e2e',
  group: 'troubleshooting-panel',
  title: 'Screenshot artifact renders as image preview',
  meta: {
    objective: 'Ensure screenshot artifacts are rendered as images, not only path text.',
    labels: ['ui', 'artifact', 'screenshot'],
    investigationHints: [
      'Check mapArtifactsForView image mode detection.',
      'Verify data-artifact-kind="image" is present in render output.',
    ],
  },
  run: async ({ page, assert }) => {
    await resetWorkflowVersionFilters(page)
    await selectRunByTitle(page, 'Fixture Publish Failed Run')
    const artifactImage = page.locator('img[data-artifact-kind="image"]').first()
    await artifactImage.waitFor({ state: 'visible' })
    const src = await artifactImage.getAttribute('src')
    assert.ok(src)
    assert.equal(src.startsWith('data:image/'), true)
  },
}

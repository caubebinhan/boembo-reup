import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

export const smokeCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    id: 'tiktok-repost-v1.debug-panel.workflow-filter-smoke',
    title: 'Debug Panel Workflow/Version Filter Smoke',
    description: 'Open troubleshooting tab, filter to tiktok-repost@1.0, and capture UI snapshot showing grouped cases.',
    risk: 'safe',
    category: 'smoke',
    group: 'smoke',
    tags: ['debug-ui', 'workflow-filter', 'artifact:screenshot'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'workflowFilter', value: 'tiktok-repost' },
        { key: 'versionFilter', value: '1.0' },
      ],
      checks: {
        ui: ['Dropdown filters apply correctly', 'Grouped sections (campaign/scan/publish/etc.) are visible'],
        logs: ['No UI load/filter crash in console logs if troubleshooting runner captures them'],
        files: ['Capture screenshot of filtered troubleshooting case catalog'],
      },
      passMessages: ['Version-aware debug catalog is visible and easy to inspect'],
    }),
  }),
  ttCase({
    id: 'tiktok-studio-smoke',
    title: 'TikTok Studio Smoke',
    description: 'Open TikTok Studio upload page, scan selectors/buttons, detect captcha, dump page artifacts.',
    risk: 'safe',
    category: 'smoke',
    group: 'smoke',
    tags: ['browser', 'studio', 'artifact:html', 'artifact:screenshot'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'account', description: 'First TikTok account with valid cookies (auto-selected)' },
        { key: 'targetUrl', value: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp' },
      ],
      checks: {
        ui: ['TikTok Studio upload page opens (not login redirect)', 'Visible buttons and data-e2e nodes are discovered'],
        logs: ['Captcha selector scan results logged', 'Current URL and selector summary logged'],
        files: ['Dump page HTML snapshot', 'Capture screenshot of current page state'],
      },
      passMessages: ['Summary includes selector/button counts and current URL'],
      errorMessages: ['Redirect-to-login / expired-session is explicit in summary'],
      notes: ['Use this as the first smoke test before any real publish case.'],
    }),
  }),
  ttCase({
    id: 'tiktok-publish-e2e',
    title: 'TikTok Publish E2E',
    description: 'Real publish test using latest account cookies + latest local video from DB.',
    risk: 'real_publish',
    category: 'publish',
    group: 'publish',
    tags: ['publish', 'e2e', 'real', 'artifact:screenshot', 'artifact:html'],
    level: 'advanced',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'account', description: 'First TikTok account with valid cookies (auto-selected)' },
        { key: 'videoSource', description: 'Latest local video found across campaigns' },
        { key: 'captionSource', description: 'generated_caption || description || #test' },
      ],
      checks: {
        db: ['At least one candidate video exists in campaigns data', 'Publish result can be correlated with campaign video and publish_history (manual follow-up if needed)'],
        logs: ['Progress logs from publisher are streamed', 'Final publish result JSON is recorded'],
        files: ['Debug artifacts captured when publisher returns them (session log, screenshot, html)'],
      },
      passMessages: ['Summary distinguishes public success vs under_review partial success'],
      errorMessages: ['Publish failure/crash includes explicit error message and context'],
      notes: ['This is a real publish case. Run only on safe test account and disposable content.'],
    }),
  }),
  ttCase({
    id: 'dashboard-verify',
    title: 'Dashboard Verify Debug',
    description: 'Full publish → dump flags → force recheck after 30s. Diagnoses verify/retry branch behavior.',
    risk: 'real_publish',
    category: 'publish',
    group: 'publish',
    tags: ['publish', 'verify', 'recheck', 'artifact:html', 'artifact:screenshot'],
    level: 'advanced',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'waitBeforeRecheckSec', value: 30 },
        { key: 'uploadStartTimeUnit', value: 'seconds', description: 'Passed to recheckPublishedStatus' },
      ],
      checks: {
        db: ['No DB mutation assertions yet (diagnostic runner focus)'],
        logs: ['Phase-by-phase logs for publish + recheck', 'All flags dumped: isReviewing, verificationIncomplete, publishStatus'],
        files: ['Publish/recheck debug artifacts preserved if provided'],
      },
      passMessages: ['Summary includes both publish and recheck statuses'],
      errorMessages: ['Recheck crash/failure is logged separately from publish failure'],
      notes: ['Primary regression diagnostic for retry branch conditions and dashboard signal drift.'],
    }),
  }),
]

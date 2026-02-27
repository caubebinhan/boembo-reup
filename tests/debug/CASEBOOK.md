# Debug Casebook

Central backlog/index for all troubleshooting/debug scenarios.

## Summary

- Total cases: **141**
- Runnable: **95**
- Planned: **46**
- Generated at: 2026-02-27T08:22:24.322Z

## Workflow Breakdown

| Scope | Total | Runnable | Planned |
|---|---:|---:|---:|
| main@1.0 | 11 | 0 | 11 |
| tiktok-repost@1.0 | 129 | 95 | 34 |
| upload-local@1.0 | 1 | 0 | 1 |

## Implementation Queue

### e2e.troubleshooting.artifact.screenshot-preview-visible
- Title: E2E Mirror: screenshot artifact preview visible
- Scope: main@1.0
- Group: external-e2e | Category: e2e | Level: intermediate
- Fingerprint: `case-1099ef16d144f29d`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### e2e.troubleshooting.sentry.feedback-links-visible
- Title: E2E Mirror: sentry feedback links visible
- Scope: main@1.0
- Group: external-e2e | Category: e2e | Level: intermediate
- Fingerprint: `case-5dedf6ed8caec44b`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### e2e.troubleshooting.suites.grouping-visible
- Title: E2E Mirror: suite grouping visible
- Scope: main@1.0
- Group: external-e2e | Category: e2e | Level: intermediate
- Fingerprint: `case-ecc4b013f6caa92a`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.captcha-event
- Title: Publish CAPTCHA Event Handling
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-a37bdeb75c601aed`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.caption-hashtag-injection
- Title: Publish Caption Hashtag Injection from Template
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: basic
- Fingerprint: `case-26ef15e3d534c171`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.caption-too-long-truncate
- Title: Publish Caption Exceeds TikTok 2200-Char Limit
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-3e221c45fefad60d`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.concurrent-account-limit
- Title: Publish Concurrent Account Limit (Same Video × N Accounts)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-e0a0cb853c0d7062`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.cookie-refresh-mid-publish
- Title: Publish: Cookie Refresh Triggers Mid-Upload
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-e4502e2e985de826`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.cookies-expired-preflight
- Title: Publish Session Expired / Cookie Invalid
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-e96dc34e869b05e7`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.debug-artifacts-integrity
- Title: Publish Debug Artifact Integrity
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-4470b11ce5e4b6fc`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.dedup-cross-account
- Title: Publish Dedup: Same Source Video Across Multiple Accounts
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-859e48c0f977d51d`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.disk-space-insufficient
- Title: Publish Fails — Insufficient Disk Space
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-fe28f7cb9c7f1b95`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.duplicate-dedup
- Title: Publish Dedup Duplicate Detection
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-1f6d58d5590f7820`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.network-timeout-upload
- Title: Publish Network Timeout During Upload
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-88326fd093e2d8ba`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.overlapping-schedule-coalesce
- Title: Publish Overlapping Schedule Slots Coalesce
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-6208d9656bbd12a4`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.post-publish-view-count-zero
- Title: Publish: Post-Publish View Count Initially 0
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-d13313b619caa471`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.privacy-mode-propagation
- Title: Publish Privacy Mode Propagation (Public/Friends/Private)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-a76a00979c1a19d1`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.public-path
- Title: Publish Path (Public Immediate)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-785753b247fae1f6`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.selector-drift-upload-button
- Title: Publish Selector Drift — Upload Button Not Found
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-92980a0429ad20ef`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.transient-error-retry-diagnostics
- Title: Publish Transient Error Retry Diagnostics
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-3b00a688a0dbbd26`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.under-review-path
- Title: Publish Path (Under Review)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-1a9ee06da44391cc`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.upload-progress-hang
- Title: Publish Upload Progress Stalls (Hang Detection)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-9e87ebb6fe771344`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.verification-incomplete-path
- Title: Publish Path (verification_incomplete)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-2000cf738486943f`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.video-file-corrupted
- Title: Publish Fails — Video File Corrupted (Below Min Size)
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-1e16f7326e4597e5`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.video-file-not-found
- Title: Publish Fails — Video File Missing at Publish Time
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: intermediate
- Fingerprint: `case-2fb46b9939987a8c`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.violation-event
- Title: Publish Violation Event Handling
- Scope: tiktok-repost@1.0
- Group: publish | Category: publish | Level: advanced
- Fingerprint: `case-a90c75828ef4198e`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.author-filter-keyword-search
- Title: Scan Author Filter on Keyword Search
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: intermediate
- Fingerprint: `case-8790cf9bec2aa2a4`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.duplicate-sources-same-campaign
- Title: Scan Duplicate Sources in Same Campaign
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: intermediate
- Fingerprint: `case-170bb5b258fa6e68`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.filter-combination-exclusive
- Title: Scan Filter Combination: minViews + maxViews Excludes All
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: intermediate
- Fingerprint: `case-01fdd8d460ee4408`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.keyword-multi-source-merge
- Title: Scan Multiple Sources: Keyword + Channel Merge
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: intermediate
- Fingerprint: `case-b6c984bb0c194e7f`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.large-history-limit
- Title: Scan Large historyLimit (500+)
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: advanced
- Fingerprint: `case-bca9cfa66aceb274`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.partial-page-load-incomplete
- Title: Scan Partial Page Load (Slow Connection)
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: advanced
- Fingerprint: `case-b10b035df9c78d05`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.private-account-zero-result
- Title: Scan Private / Non-existent Account Returns Zero
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: basic
- Fingerprint: `case-3e8b0719a06c04cb`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.rate-limit-backoff
- Title: Scan Rate Limit / 429 Backoff
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: advanced
- Fingerprint: `case-bad52e447bcee7a3`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.scan-then-publish-integration
- Title: Scan → Publish Integration: Full Pipeline Smoke
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: advanced
- Fingerprint: `case-03bd02a3052bdaa3`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.selector-drift-dump-artifacts
- Title: Channel Scan Selector Drift Diagnostics
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: advanced
- Fingerprint: `case-f6cce24f0d82c1b4`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.time-range-boundary-midnight
- Title: Scan Time Range: Videos Straddling Midnight Boundary
- Scope: tiktok-repost@1.0
- Group: scan | Category: scan | Level: advanced
- Fingerprint: `case-04993456276c4a12`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.core.pipeline-runner.sequence-resolve-vars
- Title: Unit Mirror: pipeline runner resolves vars in sequence
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: intermediate
- Fingerprint: `case-784d5d592b844544`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.main.sentry-staging.service-contracts
- Title: Unit Mirror: sentry staging service contracts
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: intermediate
- Fingerprint: `case-550086971f3045e0`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.troubleshooting.artifact-view.data-url-renders-image
- Title: Unit Mirror: data URL renders as image
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: basic
- Fingerprint: `case-a0f5bcd585c2e0de`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.troubleshooting.artifact-view.screenshot-path-renders-image
- Title: Unit Mirror: screenshot path renders as image
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: basic
- Fingerprint: `case-c860e164f1f2fdcd`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.troubleshooting.grouping.suite-and-group-order
- Title: Unit Mirror: grouped ordering is deterministic
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: basic
- Fingerprint: `case-3cc19c318f21546c`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.troubleshooting.suite-classification.db-is-integration
- Title: Unit Mirror: db tag maps to Integration suite
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: basic
- Fingerprint: `case-a21c5ca930eefe7c`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.troubleshooting.suite-classification.real-publish-is-e2e
- Title: Unit Mirror: real_publish maps to E2E suite
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: basic
- Fingerprint: `case-231fe9cc2caeb919`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### unit.troubleshooting.suite-classification.static-analysis-is-unit
- Title: Unit Mirror: static-analysis maps to Unit suite
- Scope: main@1.0
- Group: external-unit | Category: unit | Level: basic
- Fingerprint: `case-7d543143859da020`
- Source: `src/main/services/troubleshooting/cases/nonWorkflowCases.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### upload-local-v1.workflow-smoke
- Title: Upload Local v1 Smoke (Planned)
- Scope: upload-local@1.0
- Group: smoke | Category: smoke | Level: basic
- Fingerprint: `case-baff0f25c0db0f49`
- Source: `src/workflows/upload-local/v1.0/troubleshooting/cases/index.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

## Runnable Cases

- dashboard-verify (`case-e6d123d1b79a8c54`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/smoke.ts
- tiktok-publish-e2e (`case-3fb8b15dd6580665`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/smoke.ts
- tiktok-repost-v1.async-verify.concurrency-key-serialization (`case-778f04ed36ef0c1e`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.cross-worker-dedup-safety (`case-9d35e05eb671bcb4`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.dedupe-active-task (`case-41f28500c5534942`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.lease-reclaim (`case-e35bdfc391506206`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.max-retries-exceeded-manual-fallback (`case-399eebcb362b250a`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.nonblocking-smoke (`case-3b7f87f786b1bd40`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.queue-backpressure (`case-990cf873fc4eaddf`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.result-persisted-correct-campaign (`case-6f7744a4614897a4`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.timeout-manual-check (`case-91281dce9cce1961`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.async-verify.worker-crash-mid-verify (`case-e32a9e5107bd7b94`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/asyncVerify.ts
- tiktok-repost-v1.campaign.all-videos-failed-terminal (`case-4f0fa4eb2d85e9a6`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.completed-immutability (`case-cf9542debaa09a58`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.concurrent-save-race-smoke (`case-3961e99a78b8d06d`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.create-smoke (`case-09d071f4b4970dc7`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.delete-while-running (`case-5d0342200552bc93`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.detail-ui-open-snapshot (`case-f1b15b0c0e358355`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.edit-params-while-running (`case-8217b4763b83c12e`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.multi-campaign-same-source (`case-f9fef22fbd8c498c`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.scheduler-missed-window-auto-reschedule (`case-46fa351d469825a1`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.stats-counter-integrity (`case-da6825503669e116`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.trigger-pause-resume (`case-872c960b8d61613f`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.campaign.video-status-transitions-valid (`case-27912b464664825c`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.caption.generated-override (`case-8282830f8cbb6029`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.caption.source-fallback (`case-fad99f19a10a9ad0`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.caption.unicode-hashtag-preserve (`case-ca1056ded1729c56`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.compat.db-schema-forward-compat-new-field (`case-8ea6ccb6b03587bc`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.compat.flow-snapshot-version-lock (`case-9522b59ab2f49ecf`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.compat.multi-workflow-coexistence (`case-eba49647a7771d42`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.compat.old-campaign-rerun-after-code-update (`case-9e1bcf8f8ff802b5`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.compat.orphan-async-tasks-deleted-video (`case-fa0944f882c16aa1`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.compat.params-defaults-upgrade (`case-e7283877a64b3961`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.compat.workflow-catalog-dynamic-discovery (`case-04ffbde7ce246362`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/compat.ts
- tiktok-repost-v1.debug-panel.workflow-filter-smoke (`case-ebe3ccb88c34666e`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/smoke.ts
- tiktok-repost-v1.loop.resume-last-processed-index (`case-260d80c1ce46e469`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/campaign.ts
- tiktok-repost-v1.network.cache-etag-304-revalidation (`case-dde198c6983ca572`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.cancel-inflight-on-campaign-pause (`case-65b7e9b4e0d31e3a`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.circuit-breaker-half-open-recovery (`case-189a798c25bc50a0`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.circuit-breaker-open-on-repeated-failures (`case-0b7b0b240fc5e963`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.clock-skew-retry-after-clamp (`case-66fd2a1c45273c6e`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.connection-reset-mid-upload (`case-b5c4cccb09df31cf`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.content-length-mismatch-corruption-guard (`case-95130b49b07010e6`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.dns-resolution-failure-failover (`case-70027b677ee12dc0`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.dual-stack-ipv6-to-ipv4-fallback (`case-0a41fec8bcd84717`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.global-rate-limit-shared-account-throttle (`case-0313a8f008867e4c`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.http-429-retry-after (`case-a6426d269fe564c6`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.http-503-exponential-backoff (`case-200832daf1614727`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.http2-goaway-retry-path (`case-242f44d17db152ec`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.idempotency-key-dedupe-on-retry (`case-036c53b893df9d17`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.jitter-seed-deterministic-retry-order (`case-9975be0365499010`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.multipart-chunk-resume-after-failure (`case-2b98a1fdffe612c9`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.offline-preflight-block (`case-1220d758a5815578`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.packet-loss-progress-stall-detect (`case-4b0c7a979acdd32e`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.partial-json-response-guard (`case-236c24469d3f5748`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.proxy-auth-required-407 (`case-0d96e7a0579e5e41`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.proxy-pool-failover-rotation (`case-f6dd7723838c5022`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.redirect-loop-detection (`case-ec4068971859c2e5`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.retry-budget-exhaustion-terminal (`case-2e58727417024f94`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.schema-drift-missing-required-field (`case-77b82989e167f8ab`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.slow-start-first-byte-timeout (`case-d5063eac01a1988a`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.tls-handshake-failure-classification (`case-8d7ff6778742ffc9`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.upload-connection-drain-timeout (`case-a1b7ab5877ceb1a9`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.upload-timeout-midstream (`case-93707540a5a590af`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.upload-timeout-retry-jitter (`case-1bdbae9b7b455a76`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.network.websocket-disconnect-reconnect (`case-8d4d8ffd2dcb60c7`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/network.ts
- tiktok-repost-v1.recovery.boot-job-audit-stale-cleanup (`case-15b4428030317172`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.corrupted-campaign-doc (`case-f241011e5111e970`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.crash-mid-download (`case-9d2ad00b10274318`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.db-lock-during-recovery (`case-65c04ed5b45a6361`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.failed-counter-drift (`case-ead5152534ac4b48`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.idempotent-second-run (`case-13dc2a8547a4e514`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.missed-scheduled-videos (`case-ef1c0eff2dbea644`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.multi-campaign-parallel-recovery (`case-d02a58a05664695b`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.reset-under-review (`case-606b138253fb5164`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.recovery.stuck-running-job-diagnostic (`case-420945a6c75f4a51`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/recovery.ts
- tiktok-repost-v1.scan.channel-smoke (`case-26709ce605f974c4`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.scan.empty-channel (`case-433cf5a1852ff691`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.scan.filter-thresholds-fixture (`case-c69b9634e600a607`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.scan.rescan-dedupe-existing-items (`case-1f93221aeff0ddd6`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.scan.session-expired (`case-05987c1036f02b58`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.scan.wizard-sources-edge-validation-gaps (`case-49de22b993dda311`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.scan.wizard-sources-main-validation (`case-f68f2ade997b2442`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts
- tiktok-repost-v1.thumbnail.bulk-mixed-shapes-grid-snapshot (`case-a46c3a83f435f0b3`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/thumbnail.ts
- tiktok-repost-v1.thumbnail.detail-ui-codepath-contract (`case-992785651ebf7cf8`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/thumbnail.ts
- tiktok-repost-v1.thumbnail.malformed-payload-fallback (`case-ffb2087a62396188`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/thumbnail.ts
- tiktok-repost-v1.thumbnail.normalize-nested-object (`case-cc033ce8b273c3ba`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/thumbnail.ts
- tiktok-repost-v1.thumbnail.normalize-string (`case-bf89f7f63d27e604`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/thumbnail.ts
- tiktok-repost-v1.thumbnail.ui-render-preview (`case-41bcab9e8b620f3d`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/thumbnail.ts
- tiktok-repost-v1.transform-pipeline.field-integrity-db-assert (`case-f91eaf92ed21e786`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.transform.chain-smoke (`case-03fb3175b301a1d0`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.transform.condition-skip-item (`case-711e1a3044163fc1`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.transform.null-input-guard (`case-0c0701db3e477cc8`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-repost-v1.transform.on-error-continue-policy (`case-fb002b6b3644c2c8`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/captionTransform.ts
- tiktok-studio-smoke (`case-b7929d4172c0f34b`) -> src/workflows/tiktok-repost/v1.0/troubleshooting/cases/smoke.ts

## Notes

- Case runtime metadata and artifacts are persisted by `TroubleshootingService` into `tests/debug/artifacts` and `tests/debug/footprints`.
- Use `npm run debug:casebook` after adding/editing case definitions.


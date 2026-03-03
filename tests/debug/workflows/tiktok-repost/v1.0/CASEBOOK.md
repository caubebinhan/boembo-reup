# Debug Casebook: tiktok-repost@1.0

- Implemented cases (JSON): **95**
- TODO cases (Markdown): **34**
- Generated at: 2026-03-03T08:18:07.199Z

## Group Breakdown

| Group | Implemented | TODO |
|---|---:|---:|
| async_verify | 10 | 0 |
| campaign | 13 | 0 |
| caption | 3 | 0 |
| compat | 7 | 0 |
| network | 30 | 0 |
| publish | 2 | 23 |
| recovery | 10 | 0 |
| scan | 7 | 11 |
| smoke | 2 | 0 |
| thumbnail | 6 | 0 |
| transform | 5 | 0 |

## TODO Queue

### tiktok-repost-v1.publish.captcha-event
- Title: Publish CAPTCHA Event Handling
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-65`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.caption-hashtag-injection
- Title: Publish Caption Hashtag Injection from Template
- Group: publish | Category: publish | Level: basic
- Code: `case-TIKTOK-66`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.caption-too-long-truncate
- Title: Publish Caption Exceeds TikTok 2200-Char Limit
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-67`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.concurrent-account-limit
- Title: Publish Concurrent Account Limit (Same Video x N Accounts)
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-68`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.cookie-refresh-mid-publish
- Title: Publish: Cookie Refresh Triggers Mid-Upload
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-69`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.cookies-expired-preflight
- Title: Publish Session Expired / Cookie Invalid
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-70`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.debug-artifacts-integrity
- Title: Publish Debug Artifact Integrity
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-72`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.dedup-cross-account
- Title: Publish Dedup: Same Source Video Across Multiple Accounts
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-73`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.disk-space-insufficient
- Title: Publish Fails - Insufficient Disk Space
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-74`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.duplicate-dedup
- Title: Publish Dedup Duplicate Detection
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-75`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.network-timeout-upload
- Title: Publish Network Timeout During Upload
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-76`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.overlapping-schedule-coalesce
- Title: Publish Overlapping Schedule Slots Coalesce
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-77`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.post-publish-view-count-zero
- Title: Publish: Post-Publish View Count Initially 0
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-78`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.privacy-mode-propagation
- Title: Publish Privacy Mode Propagation (Public/Friends/Private)
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-79`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.public-path
- Title: Publish Path (Public Immediate)
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-80`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.selector-drift-upload-button
- Title: Publish Selector Drift - Upload Button Not Found
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-81`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.transient-error-retry-diagnostics
- Title: Publish Transient Error Retry Diagnostics
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-83`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.under-review-path
- Title: Publish Path (Under Review)
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-84`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.upload-progress-hang
- Title: Publish Upload Progress Stalls (Hang Detection)
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-85`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.verification-incomplete-path
- Title: Publish Path (verification_incomplete)
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-86`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.video-file-corrupted
- Title: Publish Fails - Video File Corrupted (Below Min Size)
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-87`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.video-file-not-found
- Title: Publish Fails - Video File Missing at Publish Time
- Group: publish | Category: publish | Level: intermediate
- Code: `case-TIKTOK-88`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.publish.violation-event
- Title: Publish Violation Event Handling
- Group: publish | Category: publish | Level: advanced
- Code: `case-TIKTOK-89`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/publish.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.author-filter-keyword-search
- Title: Scan Author Filter on Keyword Search
- Group: scan | Category: scan | Level: intermediate
- Code: `case-TIKTOK-100`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.duplicate-sources-same-campaign
- Title: Scan Duplicate Sources in Same Campaign
- Group: scan | Category: scan | Level: intermediate
- Code: `case-TIKTOK-102`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.filter-combination-exclusive
- Title: Scan Filter Combination: minViews + maxViews Excludes All
- Group: scan | Category: scan | Level: intermediate
- Code: `case-TIKTOK-104`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.keyword-multi-source-merge
- Title: Scan Multiple Sources: Keyword + Channel Merge
- Group: scan | Category: scan | Level: intermediate
- Code: `case-TIKTOK-106`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.large-history-limit
- Title: Scan Large historyLimit (500+)
- Group: scan | Category: scan | Level: advanced
- Code: `case-TIKTOK-107`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.partial-page-load-incomplete
- Title: Scan Partial Page Load (Slow Connection)
- Group: scan | Category: scan | Level: advanced
- Code: `case-TIKTOK-108`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.private-account-zero-result
- Title: Scan Private / Non-existent Account Returns Zero
- Group: scan | Category: scan | Level: basic
- Code: `case-TIKTOK-109`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.rate-limit-backoff
- Title: Scan Rate Limit / 429 Backoff
- Group: scan | Category: scan | Level: advanced
- Code: `case-TIKTOK-110`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.scan-then-publish-integration
- Title: Scan -> Publish Integration: Full Pipeline Smoke
- Group: scan | Category: scan | Level: advanced
- Code: `case-TIKTOK-112`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.selector-drift-dump-artifacts
- Title: Channel Scan Selector Drift Diagnostics
- Group: scan | Category: scan | Level: advanced
- Code: `case-TIKTOK-113`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

### tiktok-repost-v1.scan.time-range-boundary-midnight
- Title: Scan Time Range: Videos Straddling Midnight Boundary
- Group: scan | Category: scan | Level: advanced
- Code: `case-TIKTOK-115`
- Source: `src/workflows/tiktok-repost/v1.0/troubleshooting/cases/scan.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

## Implemented JSON Layout

- Implemented cases are split by group and written as one JSON file per case.
- Path pattern: `groups/<group>/cases/<case-id>.json`


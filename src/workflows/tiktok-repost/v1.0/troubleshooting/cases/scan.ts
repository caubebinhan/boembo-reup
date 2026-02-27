import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

const SCAN_CASE_BASE = {
  risk: 'safe' as const,
  category: 'scan',
  group: 'scan',
  implemented: false
}

export const scanCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.wizard-sources-main-validation',
    title: 'Wizard Sources Main Validation (Step Contract)',
    description:
      'Static analysis of wizard source step to confirm basic validation and filter controls are wired (main path).',
    tags: ['wizard', 'scan', 'validation', 'static-analysis'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'files', value: 'Step2_Sources.tsx + workflows/tiktok-repost/v1.0/wizard.ts' }
      ],
      checks: {
        ui: ['Step2 renders filter controls: Min Likes, Min Views, Max Views, Within Days'],
        logs: ['Runner reports which required controls/validation clauses are present'],
        files: ['Source file paths included in result artifacts for audit']
      },
      passMessages: ['Main wizard source step contract is present and discoverable'],
      errorMessages: [
        'Missing core source-step validation or missing filter controls are explicitly listed'
      ]
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.wizard-sources-edge-validation-gaps',
    title: 'Wizard Sources Edge Validation Gaps',
    description:
      'Analyze Step2/wizard edge cases (min/max views, custom range dates, historyLimit coercion) and fail if gaps are found.',
    tags: ['wizard', 'scan', 'validation', 'edge', 'static-analysis'],
    level: 'advanced',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'focus', value: 'custom_range dates / minViews<=maxViews / numeric coercion' }
      ],
      checks: {
        ui: ['Step2 input constraints exist (HTML min attrs) where applicable'],
        db: ['N/A (code-analysis case)'],
        logs: ['Runner emits gap list with exact file/line clues (text match)'],
        files: ['Source paths returned for AI/debug footprint']
      },
      errorMessages: [
        'Case should fail when edge validation gaps still exist (expected during hardening phase)'
      ],
      notes: ['This is intentionally a red test until runtime/wizard validation gaps are fixed.']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.filter-thresholds-fixture',
    title: 'Scanner Filter Thresholds Fixture (min likes/views/max views/withinDays)',
    description:
      'Run tiktok-scanner node with mocked TikTokScanner result and assert per-source filtering + thumbnail batch scheduling.',
    tags: ['scan', 'filters', 'minLikes', 'minViews', 'maxViews', 'withinDays', 'fixture'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'source.type', value: 'channel' },
        { key: 'filters', value: 'minLikes=50,minViews=900,maxViews=10000,withinDays=30' },
        { key: 'fixtureVideos', value: 5 }
      ],
      checks: {
        db: ['No DB writes required; node output assertions on filtered list'],
        logs: ['Scanner progress + filter summary logs are captured'],
        events: ['N/A (node context progress only)'],
        files: ['N/A (fixture run)']
      },
      passMessages: [
        'Filtered video IDs/count match expected thresholds; thumbnail async batch payload count matches filtered thumbnails'
      ],
      errorMessages: ['Mismatch includes expected vs actual IDs and scheduled thumbnail count']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.channel-smoke',
    title: 'Channel Scan Smoke',
    description:
      'Scan source channel and verify videos are added into campaign with expected fields and statuses.',
    tags: ['scan', 'source', 'db', 'artifact:html', 'artifact:screenshot'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'sourceChannel', description: 'Configured source channel/URL fixture' },
        { key: 'maxItems', value: 5, description: 'Suggested smoke cap for deterministic runs' }
      ],
      checks: {
        db: [
          'campaign videos[] appended with source records',
          'Each video has platform_id + data payload + initial status',
          'No malformed thumbnail/caption fields break persistence'
        ],
        ui: ['Campaign detail list reflects scanned items'],
        logs: ['Scanner progress and item count summary logged'],
        files: [
          'If browser-based scan path is used: dump HTML and screenshot on selector drift/error'
        ]
      },
      errorMessages: ['Empty/failed source response includes request context']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.empty-channel',
    title: 'Channel Scan Empty Result',
    description:
      'Source scan returns zero videos and workflow exits/alerts gracefully without crashing.',
    tags: ['scan', 'empty-result', 'edge'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [{ key: 'fixtureResponse', value: 'empty-array' }],
      checks: {
        db: [
          'No corrupt/placeholder video rows inserted',
          'Campaign status/alerts remain consistent'
        ],
        logs: ['Empty result path logged clearly and treated as handled outcome'],
        events: ['Optional warning/info alert emitted to user']
      },
      passMessages: ['Workflow handles zero-result scan without exception'],
      errorMessages: ['Unexpected null/undefined payload path is visible in logs']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.session-expired',
    title: 'Channel Scan Session Expired',
    description:
      'Simulate expired session/cookies during scan and verify error handling / user-facing logs.',
    tags: ['scan', 'auth', 'session-expired', 'edge', 'artifact:html', 'artifact:screenshot'],
    level: 'intermediate',
    implemented: true,
    meta: meta({
      parameters: [{ key: 'fixtureAuthState', value: 'expired-session' }],
      checks: {
        db: ['No partial/corrupt video rows persisted on auth failure'],
        ui: ['User-facing error/alert indicates session expired / re-login required'],
        logs: ['Auth failure path includes exact stage and redirect URL if browser-based'],
        files: ['Capture screenshot and HTML on login redirect/auth challenge']
      },
      errorMessages: ['Session expired is distinguished from network/selector failures']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.selector-drift-dump-artifacts',
    title: 'Channel Scan Selector Drift Diagnostics',
    description:
      'Force/fixture selector mismatch in browser scan path and verify HTML + screenshot dumps are preserved for debugging.',
    tags: ['scan', 'selector-drift', 'edge', 'artifact:html', 'artifact:screenshot'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureMode', value: 'selector-mismatch' },
        { key: 'dumpArtifactsOnFail', value: true }
      ],
      checks: {
        db: ['No partially parsed/corrupt scan entries are persisted'],
        logs: ['Selector miss includes selector names/stage URL in logs'],
        files: ['HTML dump exists', 'Screenshot exists', 'Artifact paths included in run result']
      },
      passMessages: ['Artifact bundle is sufficient for offline selector debugging'],
      errorMessages: ['Generic "scan failed" without artifact path is considered insufficient']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.rescan-dedupe-existing-items',
    title: 'Channel Re-scan Dedupe Existing Items',
    description:
      'Re-scan same source and verify existing videos are deduped/merged rather than duplicated in campaign.',
    tags: ['scan', 'dedupe', 'db', 'edge'],
    level: 'intermediate',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'fixtureInitialVideos', value: 5 },
        { key: 'fixtureRescanOverlap', value: '3 existing + 2 new' }
      ],
      checks: {
        db: [
          'Existing videos matched by platform_id are not duplicated',
          'New items append correctly with stable ordering'
        ],
        logs: ['Dedup/merge counts are logged (existing/new/skipped)']
      },
      passMessages: ['Rescan is idempotent for already-imported source items']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.rate-limit-backoff',
    title: 'Scan Rate Limit / 429 Backoff',
    description:
      'TikTok API returns 429 (rate limit) during scan; verify scanner backs off, retries, and surfaces rate-limit alert.',
    tags: ['scan', 'rate-limit', '429', 'backoff', 'edge'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureResponseStatus', value: '429 after first page' },
        { key: 'retryAfterSec', value: 5 }
      ],
      checks: {
        db: ['Videos from pre-rate-limit pages are persisted; no duplicates on retry'],
        logs: ['Rate-limit 429 detected, backoff delay logged, retry attempt count'],
        events: ['Alert emitted notifying user of rate limiting if scan aborts early']
      },
      errorMessages: ['Rate limit does not crash scanner - graceful partial-result path taken']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.private-account-zero-result',
    title: 'Scan Private / Non-existent Account Returns Zero',
    description:
      'Private account or typo in channel URL produces zero results; scanner exits cleanly without error crash.',
    tags: ['scan', 'private', 'not-found', 'edge'],
    level: 'basic',
    meta: meta({
      parameters: [{ key: 'fixtureChannelType', value: 'private | non-existent' }],
      checks: {
        db: ['No rows inserted for private/missing account', 'Campaign remains in valid state'],
        logs: ['Account resolution failure reason logged (private | not found | redirect)'],
        events: ['Optional user-facing warning emitted suggesting channel check']
      },
      passMessages: ['Private/non-existent channel handled gracefully without corruption']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.author-filter-keyword-search',
    title: 'Scan Author Filter on Keyword Search',
    description:
      'Keyword scan produces videos from multiple creators; author filter configured to exact @handle reduces to expected subset.',
    tags: ['scan', 'keyword', 'author-filter', 'filter', 'db'],
    level: 'intermediate',
    meta: meta({
      parameters: [
        { key: 'source.type', value: 'keyword' },
        { key: 'fixtureKeyword', value: '#trending' },
        { key: 'authorFilter', value: '@specific_creator' }
      ],
      checks: {
        db: [
          'All persisted videos have author === @specific_creator',
          'Videos from other authors are excluded from campaign'
        ],
        logs: ['Author filter applied: included/excluded counts logged per page']
      },
      passMessages: ['Author filter narrows keyword results to correct creator subset']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.time-range-boundary-midnight',
    title: 'Scan Time Range: Videos Straddling Midnight Boundary',
    description:
      'withinDays filter boundary: videos posted at 23:59 yesterday vs 00:01 today treated correctly by date comparison.',
    tags: ['scan', 'time-range', 'withinDays', 'boundary', 'edge'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureWithinDays', value: 1 },
        { key: 'fixtureVideoTimestamps', value: 'midnight ± 1 minute' }
      ],
      checks: {
        db: ['Videos at boundary include/exclude correctly per UTC-aligned day comparison'],
        logs: ['Timestamp comparison decision logged for boundary videos']
      },
      errorMessages: ['Off-by-one-day errors produce explicit mismatch in test output']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.large-history-limit',
    title: 'Scan Large historyLimit (500+)',
    description:
      'historyLimit set to 500; verify pagination continues to final page without infinite loop or memory spike.',
    tags: ['scan', 'historyLimit', 'pagination', 'performance', 'edge'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'historyLimit', value: 500 },
        { key: 'fixturePageSize', value: 20 }
      ],
      checks: {
        db: ['Up to historyLimit rows inserted, no duplicates'],
        logs: ['Page count and fetched total logged; stop condition observed'],
        events: ['No timeout/memory alert from pagination loop']
      },
      passMessages: ['Large historyLimit paginates to completion without crash or runaway loop']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.duplicate-sources-same-campaign',
    title: 'Scan Duplicate Sources in Same Campaign',
    description:
      'Campaign has two identical source channels; verify scanner deduplicates scanned videos at ingestion, not just display.',
    tags: ['scan', 'dedupe', 'sources', 'edge'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureDuplicateSource', value: 'same channel URL x2 in sources[]' }],
      checks: {
        db: [
          'campaign.videos has no duplicate platform_id after scanning both sources',
          'Dedup is applied at store level'
        ],
        logs: ['Duplicate source detection logged']
      },
      passMessages: ['Duplicate sources produce no duplicate campaign video rows']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.keyword-multi-source-merge',
    title: 'Scan Multiple Sources: Keyword + Channel Merge',
    description:
      'Campaign has both a keyword source and a channel source; results merge correctly with dedup by platform_id.',
    tags: ['scan', 'multi-source', 'keyword', 'channel', 'merge', 'db'],
    level: 'intermediate',
    meta: meta({
      parameters: [
        { key: 'fixtureSourceCount', value: 2 },
        { key: 'expectedOverlap', value: '2 videos appear in both' }
      ],
      checks: {
        db: [
          'Merged video list has no duplicate platform_id from different sources',
          'Each video retains source attribution metadata'
        ],
        logs: ['Per-source scan counts logged; dedup merge summary logged']
      },
      passMessages: ['Multi-source merge produces clean, deduplicated campaign video set']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.scan-then-publish-integration',
    title: 'Scan -> Publish Integration: Full Pipeline Smoke',
    description:
      'End-to-end: scan source, apply filters, download thumbnail, queue video, publish. Verify each handoff preserves required fields.',
    risk: 'real_publish',
    tags: ['scan', 'publish', 'integration', 'e2e', 'pipeline'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureSource', value: 'real channel with ≥1 video' },
        { key: 'maxScanItems', value: 1 }
      ],
      checks: {
        db: [
          'Scanned video platform_id exists in publish_history after pipeline completes',
          'local_path, thumbnail, description all persisted at each node handoff'
        ],
        logs: ['Node transition logs: scanner -> downloader -> publisher -> verify']
      },
      passMessages: ['Full pipeline smoke: scan output is correctly consumed by publish node']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.partial-page-load-incomplete',
    title: 'Scan Partial Page Load (Slow Connection)',
    description:
      'TikTok page loads partially (JS timeout); scanner detects incomplete page and retries or exits cleanly.',
    tags: ['scan', 'partial-load', 'timeout', 'edge', 'artifact:html', 'artifact:screenshot'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'fixturePageLoadMs', value: '>10000ms (emulated throttle)' }],
      checks: {
        db: ['No garbled/partial video rows from incomplete DOM'],
        logs: ['Page-incomplete detection logged with URL + selector hit counts'],
        files: ['HTML + screenshot at timeout captured for selector drift analysis']
      },
      errorMessages: ['Slow page load does not produce corrupted video records']
    })
  }),
  ttCase({
    ...SCAN_CASE_BASE,
    id: 'tiktok-repost-v1.scan.filter-combination-exclusive',
    title: 'Scan Filter Combination: minViews + maxViews Excludes All',
    description:
      'minViews=9000 and maxViews=1000 (impossible range); scanner returns nothing and logs the contradiction without crashing.',
    tags: ['scan', 'filters', 'edge', 'exclusive-range', 'validation'],
    level: 'intermediate',
    meta: meta({
      parameters: [
        { key: 'minViews', value: 9000 },
        { key: 'maxViews', value: 1000 }
      ],
      checks: {
        db: [
          'Zero rows inserted (no video passes impossible range)',
          'Campaign remains in valid state'
        ],
        logs: ['Impossible range warning logged before filter loop runs'],
        events: ['Optional warning alert surfaced for impossible filter combination']
      },
      passMessages: [
        'Contradictory filter range handled gracefully: zero results, clear log message'
      ]
    })
  })
]

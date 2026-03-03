import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

const PUBLISH_CASE_BASE = {
  risk: 'safe' as const,
  category: 'publish',
  group: 'publish',
  errorCode: 'DG-106',
  implemented: false
}

export const publishCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.public-path',
    title: 'Publish Path (Public Immediate)',
    description:
      'Publish returns public immediately; publish_history, counters, and UI status all update correctly.',
    risk: 'real_publish',
    tags: ['publish', 'public', 'db', 'events', 'artifact:screenshot', 'artifact:html'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'expectedOutcome', value: 'public-immediate' },
        { key: 'requiresCookies', value: true },
        { key: 'requiresLocalVideo', value: true }
      ],
      checks: {
        db: [
          'publish_history status=published with videoUrl/videoId',
          'campaign video status=published and publish_url set',
          'published counter increments exactly once'
        ],
        ui: ['Campaign detail status chip updates to PUBLISHED'],
        logs: ['Publish progress + final success logs emitted'],
        events: ['video:publish-status and video:published emitted'],
        files: ['Capture debug artifacts (screenshot/html/session log) if publisher returns them']
      },
      passMessages: ['Immediate public path verified end-to-end without retry branch']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.under-review-path',
    title: 'Publish Path (Under Review)',
    description:
      'Publish returns under_review; verify status transitions, retry/progress logs, and final outcome.',
    risk: 'real_publish',
    tags: ['publish', 'under_review', 'retry', 'artifact:screenshot', 'artifact:html'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'expectedOutcome', value: 'under_review or delayed-public' }],
      checks: {
        db: [
          'publish_history starts as under_review and transitions if later public',
          'campaign video status reflects under_review/verifying/published'
        ],
        logs: ['Retry delay, attempt counters, and recheck statuses logged'],
        events: ['Retry-related video:publish-status events emitted'],
        files: ['Dump HTML/screenshot when recheck selector drift suspected']
      },
      errorMessages: ['Verification failure reason and attempt number captured in logs']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.verification-incomplete-path',
    title: 'Publish Path (verification_incomplete)',
    description:
      'Force verification_incomplete branch and ensure it does not regress into under_review behavior.',
    risk: 'real_publish',
    tags: ['publish', 'verification_incomplete', 'regression'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'expectedOutcome', value: 'verification_incomplete' }],
      checks: {
        db: [
          'campaign video status=verification_incomplete',
          'publish_history stored as published when upload succeeded'
        ],
        logs: ['Branch decision explicitly identifies verification_incomplete'],
        events: ['video:published carries verificationIncomplete=true']
      },
      passMessages: ['verification_incomplete path remains distinct from under_review retry branch']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.duplicate-dedup',
    title: 'Publish Dedup Duplicate Detection',
    description:
      'Duplicate source/fingerprint should skip upload and emit duplicate status/event with existing URL.',
    tags: ['publish', 'dedup', 'duplicate', 'db'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureDedupMatch', value: 'source_platform_id or file_fingerprint' }],
      checks: {
        db: [
          'No new upload is attempted when duplicate found',
          'campaign video status=duplicate and publish_url points to existing row'
        ],
        logs: ['Duplicate reason + matchedBy logged'],
        events: ['video:duplicate-detected and video:publish-status duplicate emitted']
      }
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.captcha-event',
    title: 'Publish CAPTCHA Event Handling',
    description:
      'CAPTCHA during publish should mark video captcha, emit event, and continue loop safely.',
    tags: ['publish', 'captcha', 'edge', 'artifact:screenshot', 'artifact:html'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'fixtureErrorType', value: 'captcha' }],
      checks: {
        db: [
          'campaign video status=captcha',
          'No failed counter increment unless policy requires it'
        ],
        logs: ['CAPTCHA path logs mention skip/continue behavior'],
        events: ['captcha:detected event emitted with debugArtifacts'],
        files: ['Capture HTML/screenshot around captcha challenge when possible']
      },
      errorMessages: ['Captcha path should not surface as generic publish failure']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.violation-event',
    title: 'Publish Violation Event Handling',
    description:
      'Violation path should set video violation, emit notifications, and preserve debug artifacts.',
    tags: ['publish', 'violation', 'edge', 'artifact:screenshot', 'artifact:html'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'fixtureErrorType', value: 'violation' }],
      checks: {
        db: ['campaign video status=violation', 'No publish counter increment'],
        logs: ['Violation message includes video id + context'],
        events: ['violation:detected event emitted with description/author/debugArtifacts'],
        files: ['Debug artifacts retained for manual review']
      },
      passMessages: ['Violation path is explicit and recoverable for subsequent items']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.cookies-expired-preflight',
    title: 'Publish Session Expired / Cookie Invalid',
    description:
      'Publish preflight detects invalid/expired cookies, fails clearly, and records diagnostics without attempting upload.',
    tags: ['publish', 'auth', 'session-expired', 'edge', 'artifact:html', 'artifact:screenshot'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureAuthState', value: 'expired cookies / login redirect' }],
      checks: {
        db: [
          'publish_history failure/precheck status recorded (if row created)',
          'Campaign video status reflects auth/session issue without corrupting publish_url'
        ],
        ui: ['User-facing status/error hints re-login is required'],
        logs: ['Exact stage of auth failure logged (open page / redirect / cookie parse)'],
        files: ['Capture screenshot + HTML on login redirect/auth challenge']
      },
      errorMessages: ['Session expiry should not appear as generic unknown publish exception']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.transient-error-retry-diagnostics',
    title: 'Publish Transient Error Retry Diagnostics',
    description:
      'Transient publish/recheck error path captures retry diagnostics, delay values, and artifact bundle for triage.',
    tags: [
      'publish',
      'retry',
      'transient-error',
      'diagnostics',
      'artifact:html',
      'artifact:screenshot'
    ],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureErrorSequence', value: 'timeout -> selector drift -> success/timeout' },
        { key: 'maxAttempts', value: 3 }
      ],
      checks: {
        db: [
          'Attempt metadata/status progression is persisted (publish_history and/or async task when enabled)'
        ],
        logs: ['Each retry logs reason + next delay + attempt/maxAttempts'],
        files: ['Failure attempts produce HTML/screenshot/session-log artifacts when available']
      },
      passMessages: ['Retry diagnostics are rich enough to reproduce flaky publish failures']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.debug-artifacts-integrity',
    title: 'Publish Debug Artifact Integrity',
    description:
      'When publish runner returns debugArtifacts, stored artifact paths/metadata are valid and visible in troubleshooting run UI.',
    tags: ['publish', 'artifacts', 'html', 'screenshot', 'session-log', 'ui'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureResult', value: 'debugArtifacts object with file paths' }],
      checks: {
        db: ['Troubleshooting run record persists sanitized artifact fields in settings'],
        ui: ['Artifacts panel shows html/screenshot/sessionLog entries and copy actions work'],
        logs: ['Artifact save/attach steps logged with file paths'],
        files: ['Referenced artifact paths exist and are readable']
      },
      passMessages: ['Artifact outputs are preserved and inspectable from debug tab']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.network-timeout-upload',
    title: 'Publish Network Timeout During Upload',
    description:
      'Network drops mid-upload; engine retries or marks failed cleanly without partial corrupt publish_history row.',
    tags: ['publish', 'network', 'timeout', 'retry', 'edge'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureNetworkState', value: 'drop after 30% upload progress' },
        { key: 'retryPolicy', value: 'retry-on-network (from FlowEngine)' }
      ],
      checks: {
        db: [
          'No partial/orphaned publish_history row left in failed state',
          'campaign video status reflects failed or retried correctly'
        ],
        logs: [
          'Timeout stage + bytes-sent logged',
          'FlowEngine network error handler triggered (handleNetworkError)'
        ],
        events: ['campaign:paused or campaign:network-error emitted']
      },
      errorMessages: ['Upload partial progress bytes appear in logs for triage']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.disk-space-insufficient',
    title: 'Publish Fails - Insufficient Disk Space',
    description:
      'Download phase detects low disk space before writing video file; campaign fails gracefully with user-facing alert.',
    tags: ['publish', 'disk', 'storage', 'edge', 'health-check'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureFreeMB', value: '<200MB' }],
      checks: {
        db: [
          'campaign status=failed with disk error reason',
          'No corrupt video file written to disk'
        ],
        logs: [
          'Pre-run health check: disk space check triggered (ServiceHealthMonitor)',
          'handleDiskError called with campaign context'
        ],
        events: ['campaign:failed with disk-space error class emitted']
      },
      passMessages: [
        'Disk space guard prevents partial video write and campaign is fail-safely terminated'
      ]
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.caption-too-long-truncate',
    title: 'Publish Caption Exceeds TikTok 2200-Char Limit',
    description:
      'Caption derived from template or source description exceeds TikTok character limit; verify truncation and publish still succeeds.',
    risk: 'real_publish',
    tags: ['publish', 'caption', 'truncation', 'limit', 'edge'],
    level: 'intermediate',
    meta: meta({
      parameters: [
        { key: 'fixtureCaptionLength', value: '2500 chars' },
        { key: 'limit', value: 2200 }
      ],
      checks: {
        db: [
          'Stored generated_caption is truncated to limit',
          'No duplicate-caption row from retry'
        ],
        logs: ['Caption truncation decision logged with original and final char counts'],
        events: ['Publish proceeds normally after caption truncation']
      },
      passMessages: ['Long captions are truncated deterministically without breaking publish flow']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.video-file-not-found',
    title: 'Publish Fails - Video File Missing at Publish Time',
    description:
      'Local video file was deleted between download and publish step; publisher detects missing file and marks job failed.',
    tags: ['publish', 'file', 'missing', 'edge'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureFilePath', value: 'deleted before publish attempt' }],
      checks: {
        db: ['campaign video status=failed', 'publish_history not created (no upload attempted)'],
        logs: ['File-not-found error logged with expected path and campaign context'],
        events: ['video:publish-status=failed with file_not_found reason']
      },
      errorMessages: ['Error surface clearly identifies missing file path']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.video-file-corrupted',
    title: 'Publish Fails - Video File Corrupted (Below Min Size)',
    description:
      'Downloaded video file is < 50KB; publisher rejects upload attempt and marks video for re-download or failed.',
    tags: ['publish', 'file', 'corrupted', 'size', 'edge'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureFileSize', value: '10KB (below 50KB threshold)' }],
      checks: {
        db: [
          'campaign video status=failed with corrupted_file reason',
          'Corrupt cache file is deleted before retry'
        ],
        logs: ['File size check stage logged with actual size and threshold'],
        events: ['video:publish-status=failed emitted']
      },
      passMessages: ['Corrupt file rejected before attempting upload to TikTok Studio']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.concurrent-account-limit',
    title: 'Publish Concurrent Account Limit (Same Video x N Accounts)',
    description:
      'Campaign has 3 accounts; same video publishes to all 3 sequentially respecting per-account concurrency keys.',
    risk: 'real_publish',
    tags: ['publish', 'accounts', 'concurrency', 'multi-account'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureAccountCount', value: 3 },
        { key: 'concurrencyKey', value: 'per-account' }
      ],
      checks: {
        db: [
          '3 publish_history rows created with distinct account_id',
          'No concurrent publish for same account'
        ],
        logs: ['Per-account publish sequence logged with account handle + order'],
        events: ['video:published emitted 3x with distinct accountId fields']
      },
      errorMessages: ['Single account failure does not abort other accounts in same run']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.dedup-cross-account',
    title: 'Publish Dedup: Same Source Video Across Multiple Accounts',
    description:
      'Dedup check is per-account; same source video can be published to account A but skip if already published to account B same day.',
    tags: ['publish', 'dedup', 'cross-account', 'edge'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'dedupeScope', value: 'per-account (not global)' },
        { key: 'fixtureAccounts', value: '2 accounts, same source video' }
      ],
      checks: {
        db: [
          'publish_history dedup lookup is scoped to (source_platform_id, account_id)',
          'Second account proceeds independently'
        ],
        logs: ['Per-account dedup hit/miss logged separately']
      },
      passMessages: [
        'Dedup is scoped correctly: cross-account does not block independent publishes'
      ]
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.cookie-refresh-mid-publish',
    title: 'Publish: Cookie Refresh Triggers Mid-Upload',
    description:
      'TikTok redirects to re-auth partway through upload session; publisher detects redirect and surfaces session-expired instead of upload error.',
    risk: 'real_publish',
    tags: ['publish', 'auth', 'cookie', 'redirect', 'edge', 'artifact:screenshot', 'artifact:html'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'fixturePageRedirect', value: 'login redirect mid upload-form fill' }],
      checks: {
        db: ['campaign video status=captcha or session_expired', 'No partial publish_history row'],
        logs: ['Page URL at time of detection is logged for tracing'],
        files: ['Capture screenshot + HTML at redirect detection point']
      },
      errorMessages: ['Redirect is identified as auth failure, not generic selector drift']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.upload-progress-hang',
    title: 'Publish Upload Progress Stalls (Hang Detection)',
    description:
      'Upload progress indicator freezes at <100% for >60s; publisher times out and surfaces recoverable error.',
    risk: 'real_publish',
    tags: ['publish', 'timeout', 'hang', 'progress', 'edge', 'artifact:screenshot'],
    level: 'advanced',
    meta: meta({
      parameters: [
        { key: 'fixtureProgressFreezeAt', value: '45%' },
        { key: 'hangTimeoutSec', value: 60 }
      ],
      checks: {
        db: ['campaign video=failed or queued for retry after hang timeout'],
        logs: [
          'Progress stall time and last % logged',
          'Timeout stage clearly identified in publisher logs'
        ],
        files: ['Screenshot captured at hang detection moment']
      },
      errorMessages: ['Stalled upload does not block campaign indefinitely']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.privacy-mode-propagation',
    title: 'Publish Privacy Mode Propagation (Public/Friends/Private)',
    description:
      'Campaign privacy param propagates correctly to TikTok Studio upload form; verify all three modes are selectable.',
    risk: 'real_publish',
    tags: ['publish', 'privacy', 'form-input', 'e2e'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixturePrivacyMode', value: 'public | friends_only | self_only' }],
      checks: {
        db: ['publish_history records privacy setting used'],
        logs: ['Privacy selector step logged with chosen mode and confirmation'],
        events: ['video:published includes privacy field in result metadata']
      },
      errorMessages: ['Private/friends-only mode must not fall through to public silently']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.post-publish-view-count-zero',
    title: 'Publish: Post-Publish View Count Initially 0',
    description:
      'Immediately after publish, view/like/comment counts start at 0; verify rescan later updates counters without duplicating video row.',
    tags: ['publish', 'stats', 'rescan', 'db'],
    level: 'intermediate',
    meta: meta({
      parameters: [{ key: 'fixtureTimeDelta', value: '0s post-publish vs rescan after 30m' }],
      checks: {
        db: [
          'Initial publish_history views=0 or null',
          'Rescan updates counters without creating duplicate row by platform_id'
        ],
        logs: ['Stat update path logged distinct from initial insert']
      },
      passMessages: ['Stats lifecycle from 0 to real values is idempotent and non-duplicating']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.overlapping-schedule-coalesce',
    title: 'Publish Overlapping Schedule Slots Coalesce',
    description:
      'Two schedule slots compute the same publish time concurrently; engine deduplicates and executes only once.',
    tags: ['publish', 'schedule', 'dedup', 'race', 'edge'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'fixtureSlotOverlapMs', value: '<1000ms' }],
      checks: {
        db: [
          'Only one publish_history row created per slot overlap',
          'No duplicate video status updates'
        ],
        logs: ['Scheduler dedup/coalesce decision logged']
      },
      errorMessages: ['Overlap produces exactly one publish attempt, not two']
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.selector-drift-upload-button',
    title: 'Publish Selector Drift - Upload Button Not Found',
    description:
      'TikTok Studio changes "Post" button selector; publisher fails with clear selector-drift error and dumps diagnostic HTML + screenshot.',
    tags: ['publish', 'selector-drift', 'edge', 'artifact:html', 'artifact:screenshot'],
    level: 'advanced',
    meta: meta({
      parameters: [{ key: 'fixtureSelectorOverride', value: 'post_video_button -> missing' }],
      checks: {
        db: ['campaign video=failed with selector_drift reason', 'No partial publish_history row'],
        logs: [
          'Selector name that drifted is in log',
          'Fallback selectors tried and failed are listed'
        ],
        files: ['Debug HTML + screenshot dumped via DebugHelper.dumpPageState']
      },
      errorMessages: [
        'Selector drift outputs: tried selectors list + URL at failure + artifact paths'
      ]
    })
  }),
  ttCase({
    ...PUBLISH_CASE_BASE,
    id: 'tiktok-repost-v1.publish.caption-hashtag-injection',
    title: 'Publish Caption Hashtag Injection from Template',
    description:
      'Caption template includes [Tags] placeholder; verify hashtag list is injected and appears in final submitted caption.',
    risk: 'real_publish',
    tags: ['publish', 'caption', 'template', 'hashtags', 'e2e'],
    level: 'basic',
    meta: meta({
      parameters: [
        { key: 'fixtureTemplate', value: '[Original Desc] [Tags]' },
        { key: 'fixtureHashtags', value: '#fyp #viral #repost' }
      ],
      checks: {
        db: [
          'generated_caption contains expanded hashtag list',
          'Template variables all substituted (no raw [Tags] remaining)'
        ],
        logs: ['Caption template resolution logged pre-publish'],
        events: ['Submitted caption visible in publish_history']
      },
      passMessages: ['Caption template fully resolved before upload attempt']
    })
  })
]

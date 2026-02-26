import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

export const asyncVerifyCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    id: 'tiktok-repost-v1.async-verify.nonblocking-smoke',
    title: 'Async Verify Non-blocking Smoke',
    description: 'Publisher schedules background verify task and returns immediately; loop proceeds to next item.',
    risk: 'safe',
    category: 'async_verify',
    group: 'async_verify',
    tags: ['async-task', 'publish-verify', 'nonblocking', 'db', 'events'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'fixturePublishOutcome', value: 'under_review' }],
      checks: {
        db: ['async_tasks row created with pending status and dedupe_key', 'campaign video status=under_review while loop continues'],
        logs: ['Scheduler enqueue and non-blocking handoff logged'],
        events: ['Publish status event includes next retry metadata for UI'],
      },
      passMessages: ['Loop throughput unaffected by long publish verification waits'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.async-verify.lease-reclaim',
    title: 'Async Verify Lease Reclaim',
    description: 'Expired running async verify task is reclaimed on scheduler restart and resumes safely.',
    risk: 'safe',
    category: 'async_verify',
    group: 'async_verify',
    tags: ['async-task', 'lease', 'recovery', 'edge', 'db'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureTaskState', value: 'running with expired leaseUntil' },
        { key: 'schedulerRestart', value: true },
      ],
      checks: {
        db: ['Expired leased task transitions back to pending (or is reclaimed atomically)', 'Attempt/lease metadata remains consistent after reclaim'],
        logs: ['Reclaim action and worker/task ids logged'],
      },
      errorMessages: ['No double-execute after lease reclaim'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.async-verify.dedupe-active-task',
    title: 'Async Verify Dedupe Active Task',
    description: 'Repeated scheduling for same video/account dedupes to one active async verify task.',
    risk: 'safe',
    category: 'async_verify',
    group: 'async_verify',
    tags: ['async-task', 'dedupe', 'db', 'edge'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'dedupeKeyPattern', value: 'publish-verify:{videoId}:{accountId}' }],
      checks: {
        db: ['Only one active async verify task exists per dedupe key', 'Subsequent schedule attempts return existing/duplicate outcome without new row'],
        logs: ['Dedupe hit is logged with existing task id'],
      },
      passMessages: ['Duplicate task scheduling does not create conflicting background workers'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.async-verify.timeout-manual-check',
    title: 'Async Verify Timed Out → Manual Check',
    description: 'Async verify reaches max attempts and transitions to timed_out/manual-check path with UI-visible next steps.',
    risk: 'safe',
    category: 'async_verify',
    group: 'async_verify',
    tags: ['async-task', 'timeout', 'manual-check', 'db', 'events'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureRecheckResult', value: 'always-under_review' },
        { key: 'maxAttempts', value: 3 },
      ],
      checks: {
        db: ['async_tasks status=timed_out with attempts=maxAttempts', 'campaign video remains under_review (or manual_check) with retry metadata'],
        ui: ['Debug/campaign UI shows manual-check guidance and final retry info'],
        logs: ['Attempts and timeout decision logged with final reason'],
        events: ['Notification/event emitted for manual follow-up'],
      },
      passMessages: ['Timed-out async verification is explicit, recoverable, and non-blocking'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.async-verify.concurrency-key-serialization',
    title: 'Async Verify Concurrency Key Serialization',
    description: 'Multiple async verify tasks for same account respect concurrencyKey/maxConcurrent and execute sequentially.',
    risk: 'safe',
    category: 'async_verify',
    group: 'async_verify',
    tags: ['async-task', 'concurrency', 'account', 'edge', 'db'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureTasksSameAccount', value: 3 },
        { key: 'maxConcurrent', value: 1 },
      ],
      checks: {
        db: ['At most one running task per concurrency_key at any moment', 'Other tasks remain pending and later complete/reschedule'],
        logs: ['Claim/release/skip due to concurrency limit logged with task ids'],
      },
      errorMessages: ['No thrash loop or duplicate execute for same account queue'],
    }),
  }),
]

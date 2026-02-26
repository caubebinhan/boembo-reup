import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

export const recoveryCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    id: 'tiktok-repost-v1.recovery.missed-scheduled-videos',
    title: 'Recovery Reschedules Missed Videos',
    description: 'Crash recovery detects past-due queued videos and reschedules them from now with interval spacing.',
    risk: 'safe',
    category: 'recovery',
    group: 'recovery',
    tags: ['recovery', 'scheduler', 'queued', 'db'],
    level: 'intermediate',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureMissedQueuedCount', value: 3 },
        { key: 'intervalMinutes', value: 1 },
      ],
      checks: {
        db: ['Past-due queued videos get new scheduled_for timestamps >= now', 'Rescheduled videos preserve queue order (queue_index)'],
        logs: ['Recovery logs count of rescheduled videos'],
        events: ['Alert panel receives missed-video warning'],
      },
      passMessages: ['Missed schedules are recovered deterministically without dropping videos'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.recovery.reset-under-review',
    title: 'Recovery Resets under_review to queued',
    description: 'Current v1 recovery behavior resets under_review videos to queued and retriggers campaign.',
    risk: 'safe',
    category: 'recovery',
    group: 'recovery',
    tags: ['recovery', 'under_review', 'retry', 'db'],
    level: 'intermediate',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'fixtureUnderReviewCount', value: 2 }],
      checks: {
        db: ['under_review videos become queued after recovery run', 'Campaign save persists status changes'],
        logs: ['Recovery logs reset count under_review→queued', 'Re-trigger only when no pending/running jobs remain'],
      },
      errorMessages: ['Unexpected under_review handling regression is visible in recovery log output'],
      notes: ['This is current v1 behavior and may change once async verify engine takes over.'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.recovery.stuck-running-job-diagnostic',
    title: 'Recovery Stuck Running Job Diagnostic',
    description: 'Detect/diagnose campaign jobs stuck in running state after crash and verify recovery emits actionable logs without corrupting queues.',
    risk: 'safe',
    category: 'recovery',
    group: 'recovery',
    tags: ['recovery', 'jobs', 'running', 'diagnostic', 'db'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'fixtureJobState', value: 'running + stale updated_at' }],
      checks: {
        db: ['Stale running job detection does not delete valid queued jobs', 'Campaign/job states remain reloadable after diagnostic path'],
        logs: ['Recovery diagnostic logs include stale job ids/ages and chosen action'],
        events: ['Optional warning alert surfaced for manual intervention'],
      },
      passMessages: ['Recovery produces actionable diagnostics for stuck jobs without destructive side effects'],
    }),
  }),
]

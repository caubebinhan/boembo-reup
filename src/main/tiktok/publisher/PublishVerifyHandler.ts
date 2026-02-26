import type { AsyncTaskHandler, AsyncTaskDocument, AsyncTaskDecision, LeaseHeartbeat } from '@core/async-tasks/types'
import { VideoPublisher } from './VideoPublisher'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { updatePublishHistoryRecord } from './dedup/PublishDedupStore'
import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import { settingsRepo } from '@main/db/repositories/SettingsRepo'
import { accountRepo } from '@main/db/repositories/AccountRepo'

// ── Shared helpers (extracted from publisher backend) ─────

type ReviewRetryStats = {
  avgReviewMs?: number
  samples?: number
  lastReviewMs?: number
}

const REVIEW_STATS_KEY = 'tiktok_publish_review_retry_stats_v1'

export function loadReviewStats(): Record<string, ReviewRetryStats> {
  return settingsRepo.get<Record<string, ReviewRetryStats>>(REVIEW_STATS_KEY) || {}
}

export function saveReviewStats(stats: Record<string, ReviewRetryStats>) {
  settingsRepo.set(REVIEW_STATS_KEY, stats)
}

export function estimateRetryDelayMs(accountId: string, attempt = 1): number {
  const allStats = loadReviewStats()
  const statsValues = Object.values(allStats)
  // Try find stats for this account
  const accountKey = Object.keys(allStats).find(k => k.includes(accountId))
  const stat = accountKey ? allStats[accountKey] : statsValues[0]
  
  const minMs = 2 * 60 * 1000
  const maxMs = 3 * 60 * 1000
  if (!stat?.avgReviewMs) return attempt % 2 === 0 ? maxMs : minMs + 30000
  const target = Math.round(stat.avgReviewMs / 4)
  return Math.max(minMs, Math.min(maxMs, target))
}

export function updateAdaptiveStats(accountId: string, username: string, reviewMs: number) {
  const allStats = loadReviewStats()
  const statsKey = `tiktok:${accountId}:${username}`
  const prev = allStats[statsKey] || {}
  const samples = (prev.samples || 0) + 1
  const avgReviewMs = prev.avgReviewMs == null ? reviewMs : Math.round(prev.avgReviewMs * 0.7 + reviewMs * 0.3)
  allStats[statsKey] = { avgReviewMs, samples, lastReviewMs: reviewMs }
  saveReviewStats(allStats)
  return { avgReviewMs, samples }
}

/** Safe CampaignStore patch — reopen fresh, touch only 1 video */
export function patchVideoStatus(campaignId: string, videoId: string, status: string, publishUrl?: string) {
  try {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return
    store.updateVideo(videoId, { status, publish_url: publishUrl || undefined })
    if (status === 'published') store.increment('published')
    else if (status === 'verification_incomplete') store.increment('verification_incomplete' as any)
    store.save()
  } catch (err) {
    console.error(`[PublishVerifyHandler] Failed to patch video ${videoId} to ${status}:`, err)
  }
}

// ── Handler ──────────────────────────────────────────

export const publishVerifyHandler: AsyncTaskHandler = {
  taskType: 'tiktok.publish.verify',
  estimatedMaxExecutionMs: 120_000,  // recheck can take up to 2 min

  validate(payload, version) {
    if (version !== 1) return `Unsupported payload version: ${version}`
    if (!payload.accountId) return 'Missing accountId'
    if (!payload.videoId) return 'Missing videoId'
    if (!payload.campaignId) return 'Missing campaignId'
    return null
  },

  async execute(task: AsyncTaskDocument, heartbeat: LeaseHeartbeat): Promise<AsyncTaskDecision> {
    const {
      accountId, videoId, campaignId, publishHistoryId,
      expectedVideoId, expectedVideoUrl,
      publishStartedAtSec, caption, initialStatus: _initialStatus,
    } = task.payload

    // Load FRESH account (cookies may have been updated since task was created)
    const account = accountRepo.findById(accountId)
    if (!account) {
      return { action: 'fail', error: `Account ${accountId} not found` }
    }
    const cookies = Array.isArray(account.cookies) ? account.cookies : null
    if (!cookies?.length) {
      return { action: 'fail', error: 'Account cookies expired or missing. Please re-login.' }
    }

    // Emit UI event: "verifying attempt N"
    ExecutionLogger.emitNodeEvent(campaignId, 'publisher_1', 'video:publish-status', {
      videoId,
      status: 'verifying_publish',
      message: `Retry ${task.attempt}/${task.maxAttempts}: rechecking dashboard...`,
      attempts: task.attempt,
      maxRetries: task.maxAttempts,
    })

    // Extend lease before slow network call
    heartbeat.extend()

    const publisher = new VideoPublisher()
    let recheck: any
    try {
      recheck = await publisher.recheckPublishedStatus(cookies, undefined, {
        username: account.username,
        uploadStartTime: publishStartedAtSec,  // seconds!
        expectedVideoId,
        expectedVideoUrl,
        expectedCaption: caption,
      })
    } catch (err: any) {
      return { action: 'fail', error: err?.message || String(err), retryable: true }
    }

    // ── Branch 1: recheck itself failed ──
    if (!recheck.success) {
      ExecutionLogger.emitNodeEvent(campaignId, 'publisher_1', 'video:publish-status', {
        videoId,
        status: 'under_review',
        message: `Retry ${task.attempt}/${task.maxAttempts} verify failed: ${recheck.error || 'unknown'}`,
        attempts: task.attempt,
        maxRetries: task.maxAttempts,
      })
      return {
        action: 'reschedule',
        nextRunAt: Date.now() + estimateRetryDelayMs(accountId, task.attempt),
        patchState: { lastError: recheck.error },
      }
    }

    // ── Branch 2: verification_incomplete (separate from under_review!) ──
    if (recheck.verificationIncomplete || recheck.publishStatus === 'verification_incomplete') {
      patchVideoStatus(campaignId, videoId, 'verification_incomplete', recheck.videoUrl || expectedVideoUrl)
      updatePublishHistoryRecord(publishHistoryId, {
        status: 'published',
        publishedVideoId: recheck.videoId || expectedVideoId,
        publishedUrl: recheck.videoUrl || expectedVideoUrl,
      })
      ExecutionLogger.emitNodeEvent(campaignId, 'publisher_1', 'video:publish-status', {
        videoId,
        status: 'verification_incomplete',
        videoUrl: recheck.videoUrl || expectedVideoUrl,
        message: `Retry ${task.attempt}/${task.maxAttempts}: dashboard verification still incomplete.`,
        attempts: task.attempt,
        maxRetries: task.maxAttempts,
      })
      // Keep retrying — dashboard might load next time
      return {
        action: 'reschedule',
        nextRunAt: Date.now() + estimateRetryDelayMs(accountId, task.attempt),
        patchState: { lastStatus: 'verification_incomplete' },
      }
    }

    // ── Branch 3: still under review ──
    if (recheck.isReviewing) {
      patchVideoStatus(campaignId, videoId, 'under_review', recheck.videoUrl || expectedVideoUrl)
      ExecutionLogger.emitNodeEvent(campaignId, 'publisher_1', 'video:publish-status', {
        videoId,
        status: 'under_review',
        videoUrl: recheck.videoUrl || expectedVideoUrl,
        message: `Still under review after retry ${task.attempt}/${task.maxAttempts}.`,
        attempts: task.attempt,
        maxRetries: task.maxAttempts,
      })
      return {
        action: 'reschedule',
        nextRunAt: Date.now() + estimateRetryDelayMs(accountId, task.attempt),
        patchState: { lastStatus: 'under_review' },
      }
    }

    // ── Branch 4: PUBLIC! ──
    const reviewMs = Date.now() - (publishStartedAtSec * 1000)
    const { avgReviewMs } = updateAdaptiveStats(accountId, account.username, reviewMs)

    patchVideoStatus(campaignId, videoId, 'published', recheck.videoUrl || expectedVideoUrl)
    updatePublishHistoryRecord(publishHistoryId, {
      status: 'published',
      publishedVideoId: recheck.videoId || expectedVideoId,
      publishedUrl: recheck.videoUrl || expectedVideoUrl,
    })

    ExecutionLogger.emitNodeEvent(campaignId, 'publisher_1', 'video:publish-status', {
      videoId,
      status: 'published',
      videoUrl: recheck.videoUrl || expectedVideoUrl,
      message: `Video is public! Verified after ${Math.round(reviewMs / 60000)} min (retry ${task.attempt}/${task.maxAttempts}).`,
      attempts: task.attempt,
      maxRetries: task.maxAttempts,
      actualReviewMs: reviewMs,
      learnedAvgReviewMs: avgReviewMs,
    })
    ExecutionLogger.emitNodeEvent(campaignId, 'publisher_1', 'video:published', {
      videoId,
      videoUrl: recheck.videoUrl || expectedVideoUrl,
      isReviewing: false,
      reviewVerifiedAfterMs: reviewMs,
    })

    return {
      action: 'complete',
      result: { videoUrl: recheck.videoUrl || expectedVideoUrl, reviewMs, avgReviewMs },
    }
  },
}

// Self-register handler (triggered by import from workflow module)
import { asyncTaskRegistry } from '@core/async-tasks'
asyncTaskRegistry.register(publishVerifyHandler)

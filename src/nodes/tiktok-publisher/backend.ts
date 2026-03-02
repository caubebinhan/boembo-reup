import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { failGracefully, setVideoStatus } from '@core/nodes/NodeHelpers'
import { VIDEO_STATUS } from './constants'
import { VideoPublisher } from '@main/tiktok/publisher/VideoPublisher'
import { selectPublishAccount } from '@main/tiktok/publisher/PublishAccountResolver'
import { settingsRepo } from '@main/db/repositories/SettingsRepo'
import {
  captionPreview,
  claimPublishSlot,
  computeQuickFileFingerprint as computeFileFingerprint,
  findExactDuplicatePublishHistory as findDuplicatePublishHistory,
  hashCaption,
  insertPublishHistoryRecord,
  removePublishClaim,
  updatePublishHistoryRecord,
} from '@main/tiktok/publisher/dedup/PublishDedupStore'

type ReviewRetryStats = {
  avgReviewMs?: number
  samples?: number
  lastReviewMs?: number
}

const REVIEW_STATS_KEY = 'tiktok_publish_review_retry_stats_v1'
const INSTANCE_ID = 'publisher_1'

function loadReviewStats(): Record<string, ReviewRetryStats> {
  return settingsRepo.get<Record<string, ReviewRetryStats>>(REVIEW_STATS_KEY) || {}
}

function estimateRetryDelayMs(stat?: ReviewRetryStats, attempt = 1): number {
  const minMs = 2 * 60 * 1000
  const maxMs = 3 * 60 * 1000
  if (!stat?.avgReviewMs) return attempt % 2 === 0 ? maxMs : minMs + 30000
  const target = Math.round(stat.avgReviewMs / 4)
  return Math.max(minMs, Math.min(maxMs, target))
}

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input

  // ── Guard: video input must have local_path ──
  if (!video?.local_path) {
    const pid = video?.platform_id || 'unknown'
    return failGracefully(ctx, INSTANCE_ID, pid, 'missing_input', `No local video file to publish (platform_id: ${pid})`)
  }

  // ── Guard: file must exist on disk ──
  try {
    const fs = await import('fs-extra')
    const fileExists = await fs.pathExists(video.local_path)
    if (!fileExists) {
      return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'file_not_found',
        `File not found: ${video.local_path} — video may have been deleted or moved`)
    }
    // Also check file is readable and non-empty
    const stat = await fs.stat(video.local_path)
    if (stat.size === 0) {
      return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'file_empty',
        `File is empty (0 bytes): ${video.local_path}`)
    }
  } catch (err: any) {
    return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'file_access_error',
      `Cannot access file: ${video.local_path} — ${err?.message || err}`)
  }

  // ── Guard: publish account must be available ──
  let account: any
  try {
    const selection = selectPublishAccount(video, ctx)
    account = selection.account
  } catch (err: any) {
    return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'no_account',
      `No publish account available: ${err?.message || err}`)
  }

  // ── Guard: account must have cookies ──
  const cookies = Array.isArray(account.cookies) ? account.cookies : null
  if (!cookies?.length) {
    return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'no_cookies',
      `Account @${account.username} has no cookies — please re-login`)
  }

  const caption = video.generated_caption || video.description || ''
  const sourcePlatformId = String(video.platform_id || '').trim() || undefined
  const publishDedupMeta = (video.publish_dedup_meta && typeof video.publish_dedup_meta === 'object')
    ? video.publish_dedup_meta
    : {}
  const captionHash = publishDedupMeta.captionHash || hashCaption(caption)
  const captionShort = publishDedupMeta.captionPreview || captionPreview(caption)
  const fileFingerprint = publishDedupMeta.fileFingerprint || await computeFileFingerprint(video.local_path).catch(() => undefined)
  const mediaSignature = publishDedupMeta.mediaSignature || undefined
  ctx.onProgress(`Publishing to @${account.username}...`)

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:active', {
    videoId: video.platform_id,
    title: video.description?.substring(0, 50) || video.platform_id,
  })

  // ── Dedup check ──
  const duplicate = findDuplicatePublishHistory(account.id, sourcePlatformId, fileFingerprint)
  if (duplicate) {
    let matchedBy = 'unknown'
    if (duplicate.source_platform_id && sourcePlatformId && duplicate.source_platform_id === sourcePlatformId) {
      matchedBy = 'source_platform_id'
    } else if (duplicate.file_fingerprint && fileFingerprint && duplicate.file_fingerprint === fileFingerprint) {
      matchedBy = 'file_fingerprint'
    }

    setVideoStatus(ctx, video.platform_id, 'duplicate', duplicate.published_url)

    const existingUrlSuffix = duplicate.published_url ? `. Existing URL: ${duplicate.published_url}` : ''
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:duplicate-detected', {
      videoId: video.platform_id, accountId: account.id, accountUsername: account.username,
      matchedBy, existingStatus: duplicate.status, existingVideoId: duplicate.published_video_id,
      existingVideoUrl: duplicate.published_url, sourcePlatformId, fileFingerprint, captionHash,
    })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
      videoId: video.platform_id, status: 'duplicate', videoUrl: duplicate.published_url,
      accountUsername: account.username, matchedBy, duplicateStatus: duplicate.status,
      message: `Duplicate on @${account.username} (${matchedBy})${existingUrlSuffix}`,
    })

    const existingSuffix = duplicate.published_url ? `, existing: ${duplicate.published_url}` : ''
    const msg = `Duplicate detected on @${account.username} (${matchedBy}) — skipping upload${existingSuffix}`
    ctx.logger.info(msg)
    return { action: 'continue', data: null, message: msg }
  }

  // ── Claim publish slot (race-condition guard) ──
  let claimId: string | undefined
  try {
    const claim = claimPublishSlot({
      accountId: account.id,
      sourcePlatformId: sourcePlatformId,
      fileFingerprint,
      campaignId: ctx.campaign_id,
      sourceLocalPath: video.local_path,
    })
    if (!claim.claimed) {
      const msg = `Publish slot already claimed for @${account.username} — skipping (race-condition guard)`
      ctx.logger.info(msg)
      setVideoStatus(ctx, video.platform_id, 'duplicate')
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
        videoId: video.platform_id, status: 'duplicate',
        accountUsername: account.username, matchedBy: 'claim_row',
        message: msg,
      })
      return { action: 'continue', data: null, message: msg }
    }
    claimId = claim.id
  } catch (err: any) {
    // If claim insertion fails for unexpected reasons, proceed without claim guard
    ctx.logger.error(`Claim insert failed (proceeding without guard): ${err?.message || err}`)
  }

  // ── Publish via Playwright ──
  const publisher = new VideoPublisher()
  const publishStartedAt = Date.now()
  let result: any

  try {
    result = await publisher.publish(video.local_path, caption, cookies, (msg) => {
      ctx.onProgress(`[Playwright] ${msg}`)
    }, {
      privacy: ctx.params.privacy || 'public',
      username: account.username,
    })
  } catch (err: any) {
    // Unexpected crash during publish (browser crash, OOM, network drop mid-session, etc.)
    // Remove claim so retries can re-claim
    if (claimId) removePublishClaim(claimId)
    return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'publish_crash',
      `Publisher crashed unexpectedly: ${err?.message || err}`, {
        description: video.description, author: video.author,
      })
  }

  if (!result.success) {
    // Publish failed — remove claim so retries can re-claim
    if (claimId) removePublishClaim(claimId)

    if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
    if (result.debugArtifacts) {
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'publish:debug', {
        videoId: video.platform_id, success: false, errorType: result.errorType,
        error: result.error, warning: result.warning, debugArtifacts: result.debugArtifacts,
      })
    }

    // ── Captcha ──
    if (result.errorType === 'captcha') {
      ctx.logger.info(`CAPTCHA detected for video ${video.platform_id} - skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'captcha:detected', {
        videoId: video.platform_id, debugArtifacts: result.debugArtifacts,
      })
      setVideoStatus(ctx, video.platform_id, 'captcha')
      return { action: 'continue', data: { ...video, status: 'captcha' } }
    }

    // ── Violation → publish_failed ──
    if (result.errorType === 'violation') {
      ctx.logger.info(`Content violation for video ${video.platform_id} - skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'violation:detected', {
        videoId: video.platform_id, error: result.error, debugArtifacts: result.debugArtifacts,
        description: video.description, author: video.author,
      })
      setVideoStatus(ctx, video.platform_id, VIDEO_STATUS.PUBLISH_FAILED)
      return { action: 'continue', data: { ...video, status: VIDEO_STATUS.PUBLISH_FAILED } }
    }

    // ── Session expired ──
    if (result.errorType === 'session_expired') {
      ctx.logger.error(`Session expired on @${account.username} for video ${video.platform_id}`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'session:expired', {
        videoId: video.platform_id, accountUsername: account.username,
        error: result.error, debugArtifacts: result.debugArtifacts,
      })
      setVideoStatus(ctx, video.platform_id, 'failed')
      // Return continue (don't crash loop) — session errors are per-account, not per-video
      return { action: 'continue', data: { ...video, status: 'session_expired' }, message: `Session expired on @${account.username} — please re-login` }
    }

    // ── Upload failed ──
    if (result.errorType === 'upload_failed') {
      return failGracefully(ctx, INSTANCE_ID, video.platform_id, 'upload_failed',
        `Upload failed for video ${video.platform_id}: ${result.error}`, {
          description: video.description, author: video.author, debugArtifacts: result.debugArtifacts,
        })
    }

    // ── Generic / unknown failure ──
    return failGracefully(ctx, INSTANCE_ID, video.platform_id, result.errorType || 'unknown',
      `Publish failed: ${result.error}`, {
        description: video.description, author: video.author, debugArtifacts: result.debugArtifacts,
      })
  }

  // ── Success path ──
  const emitPublishStatus = (payload: any) => {
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
      videoId: video.platform_id, ...payload,
    })
  }
  const isVerificationIncomplete = !!(result.verificationIncomplete || result.publishStatus === 'verification_incomplete')

  // Wrap post-publish DB operations in try-catch so a DB error doesn't lose the publish
  let publishHistoryId: string | undefined = claimId
  try {
    if (claimId) {
      // Update the claim row to final status (row was already inserted before upload)
      updatePublishHistoryRecord(claimId, {
        status: result.isReviewing ? 'under_review' : 'published',
        publishedVideoId: result.videoId,
        publishedUrl: result.videoUrl, mediaSignature,
      })
    } else {
      // No claim row — fallback to direct insert
      publishHistoryId = insertPublishHistoryRecord({
        accountId: account.id, accountUsername: account.username, campaignId: ctx.campaign_id,
        sourcePlatformId, sourceLocalPath: video.local_path, fileFingerprint, captionHash,
        captionPreview: captionShort, publishedVideoId: result.videoId, publishedUrl: result.videoUrl,
        status: result.isReviewing ? 'under_review' : 'published', mediaSignature,
      }) || undefined
    }
  } catch (err: any) {
    ctx.logger.error(`Failed to insert publish history record: ${err?.message || err}`)
    // Don't fail the publish — the video was already uploaded successfully
  }

  if (isVerificationIncomplete || result.isReviewing) {
    const status = isVerificationIncomplete ? 'verification_incomplete' : 'under_review'
    setVideoStatus(ctx, video.platform_id, status, result.videoUrl)

    if (publishHistoryId) {
      try {
        updatePublishHistoryRecord(publishHistoryId, {
          status: result.isReviewing ? 'under_review' : 'published',
          publishedVideoId: result.videoId,
          publishedUrl: result.videoUrl, mediaSignature,
        })
      } catch (err: any) {
        ctx.logger.error(`Failed to update publish history: ${err?.message || err}`)
      }
    }

    const allStats = loadReviewStats()
    const statsKey = `tiktok:${account.id}:${account.username}`
    const maxRetries = Math.max(5, Math.min(10, Number(ctx.params.publishVerifyMaxRetries) || 5))
    const retryIntervalMs = estimateRetryDelayMs(allStats[statsKey])

    // Schedule background async verification
    let taskId: string | undefined
    let created = false
    try {
      const scheduled = ctx.asyncTasks.schedule('tiktok.publish.verify', {
        accountId: account.id,
        videoId: video.platform_id,
        campaignId: ctx.campaign_id,
        publishHistoryId,
        expectedVideoId: result.videoId,
        expectedVideoUrl: result.videoUrl,
        caption,
        publishStartedAtSec: Math.floor(publishStartedAt / 1000),
        initialStatus: status,
        mediaSignature,
      }, {
        dedupeKey: `publish-verify:${video.platform_id}:${account.id}`,
        payloadVersion: 1,
        maxAttempts: maxRetries,
        retryIntervalMs,
        concurrencyKey: `tiktok-account:${account.id}`,
        maxConcurrent: 1,
        campaignId: ctx.campaign_id,
        ownerKey: `campaign:${ctx.campaign_id}:publisher`,
      })
      taskId = scheduled.taskId
      created = scheduled.created
    } catch (err: any) {
      ctx.logger.error(`Failed to schedule async verify task: ${err?.message || err}`)
      // Continue — the video was already published, verification can be retried manually
    }

    const predictedReviewMs = allStats[statsKey]?.avgReviewMs
    const statusLabel = status === 'verification_incomplete' ? 'Upload submitted (verification incomplete)' : 'Under content review'
    const fallbackLabel = status === 'verification_incomplete' ? 'Upload submitted' : 'Under review'
    let statusMessage: string
    if (taskId) {
      statusMessage = created
        ? `${statusLabel}. Background verification scheduled (${maxRetries} retries, ~${Math.round(retryIntervalMs / 60000)} min intervals).`
        : `Verification already scheduled (task ${taskId}).`
    } else {
      statusMessage = `${fallbackLabel} — async verify scheduling failed, manual recheck needed.`
    }
    emitPublishStatus({
      status,
      videoUrl: result.videoUrl,
      message: statusMessage,
      attempts: 0,
      maxRetries,
      predictedReviewMs,
      asyncVerifyTaskId: taskId,
    })

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
      videoId: video.platform_id, videoUrl: result.videoUrl,
      warning: [result.warning, status === 'verification_incomplete' ? 'dashboard_verification_incomplete' : 'under_content_review'].filter(Boolean).join(' | '),
      isReviewing: result.isReviewing, verificationIncomplete: isVerificationIncomplete,
      asyncVerifyTaskId: taskId, debugArtifacts: result.debugArtifacts,
    })

    if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
    const verifyInfo = taskId ? ` — async verify task ${taskId} (${created ? 'created' : 'existing'})` : ''
    ctx.logger.info(`Published (${status}): ${result.videoUrl || 'unknown url'}${verifyInfo}`)

    const returnData: Record<string, any> = {
      ...video,
      published_url: result.videoUrl,
      published: true,
      status,
      asyncVerifyTaskId: taskId,
    }
    if (isVerificationIncomplete) returnData.verification_incomplete = true
    else returnData.under_review = true

    return { data: returnData }
  }


  // Direct success (no review needed)
  setVideoStatus(ctx, video.platform_id, 'published', result.videoUrl)
  if (publishHistoryId) {
    try {
      updatePublishHistoryRecord(publishHistoryId, {
        status: 'published', publishedVideoId: result.videoId,
        publishedUrl: result.videoUrl, mediaSignature,
      })
    } catch (err: any) {
      ctx.logger.error(`Failed to update publish history: ${err?.message || err}`)
    }
  }
  emitPublishStatus({
    status: 'published', videoUrl: result.videoUrl,
    message: 'Video is public and publish verification succeeded.',
    attempts: 0, maxRetries: 0,
  })
  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
    videoId: video.platform_id, videoUrl: result.videoUrl,
    warning: result.warning, isReviewing: false, debugArtifacts: result.debugArtifacts,
  })
  if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
  ctx.logger.info(`Published: ${result.videoUrl}`)
  return { data: { ...video, published_url: result.videoUrl, published: true } }
}

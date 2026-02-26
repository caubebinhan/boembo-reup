import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { VideoPublisher } from '@main/tiktok/publisher/VideoPublisher'
import { selectPublishAccount } from '@main/tiktok/publisher/PublishAccountResolver'
import { settingsRepo } from '@main/db/repositories/SettingsRepo'
import {
  captionPreview,
  computeQuickFileFingerprint as computeFileFingerprint,
  findExactDuplicatePublishHistory as findDuplicatePublishHistory,
  hashCaption,
  insertPublishHistoryRecord,
  updatePublishHistoryRecord,
} from '@main/tiktok/publisher/dedup/PublishDedupStore'

type ReviewRetryStats = {
  avgReviewMs?: number
  samples?: number
  lastReviewMs?: number
}

const REVIEW_STATS_KEY = 'tiktok_publish_review_retry_stats_v1'

function loadReviewStats(): Record<string, ReviewRetryStats> {
  return settingsRepo.get<Record<string, ReviewRetryStats>>(REVIEW_STATS_KEY) || {}
}

function saveReviewStats(stats: Record<string, ReviewRetryStats>) {
  settingsRepo.set(REVIEW_STATS_KEY, stats)
}

function estimateRetryDelayMs(stat?: ReviewRetryStats, attempt = 1): number {
  const minMs = 2 * 60 * 1000
  const maxMs = 3 * 60 * 1000
  if (!stat?.avgReviewMs) return attempt % 2 === 0 ? maxMs : minMs + 30000
  const target = Math.round(stat.avgReviewMs / 4)
  return Math.max(minMs, Math.min(maxMs, target))
}

/** DRY helper: update video status in campaign store */
function setVideoStatus(ctx: NodeExecutionContext, platformId: string, status: string, publishUrl?: string) {
  try {
    ctx.store.updateVideo(platformId, { status, publish_url: publishUrl || undefined })
    ctx.store.save()
  } catch (err) {
    ctx.logger.error(`Failed to update video status to ${status}`, err)
  }
}

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  if (!video?.local_path) throw new Error('No local video file to publish')

  const selection = selectPublishAccount(video, ctx)
  const account = selection.account

  const cookies = Array.isArray(account.cookies) ? account.cookies : null
  if (!cookies?.length) throw new Error(`Account ${account.username} has no cookies`)

  const caption = video.generated_caption || video.description || ''
  const sourcePlatformId = String(video.platform_id || '').trim() || undefined
  const publishDedupMeta = (video.publish_dedup_meta && typeof video.publish_dedup_meta === 'object')
    ? video.publish_dedup_meta
    : {}
  const captionHash = publishDedupMeta.captionHash || hashCaption(caption)
  const captionShort = publishDedupMeta.captionPreview || captionPreview(caption)
  const fileFingerprint = publishDedupMeta.fileFingerprint || await computeFileFingerprint(video.local_path).catch(() => undefined)
  const mediaSignature = publishDedupMeta.mediaSignature || null
  ctx.onProgress(`Publishing to @${account.username}...`)

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:active', {
    videoId: video.platform_id,
    title: video.description?.substring(0, 50) || video.platform_id,
  })

  const duplicate = findDuplicatePublishHistory(account.id, sourcePlatformId, fileFingerprint)
  if (duplicate) {
    const matchedBy = duplicate.source_platform_id && sourcePlatformId && duplicate.source_platform_id === sourcePlatformId
      ? 'source_platform_id'
      : (duplicate.file_fingerprint && fileFingerprint && duplicate.file_fingerprint === fileFingerprint)
        ? 'file_fingerprint'
        : 'unknown'

    setVideoStatus(ctx, video.platform_id, 'duplicate', duplicate.published_url)

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:duplicate-detected', {
      videoId: video.platform_id, accountId: account.id, accountUsername: account.username,
      matchedBy, existingStatus: duplicate.status, existingVideoId: duplicate.published_video_id,
      existingVideoUrl: duplicate.published_url, sourcePlatformId, fileFingerprint, captionHash,
    })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
      videoId: video.platform_id, status: 'duplicate', videoUrl: duplicate.published_url,
      accountUsername: account.username, matchedBy, duplicateStatus: duplicate.status,
      message: `Duplicate on @${account.username} (${matchedBy})${duplicate.published_url ? `. Existing URL: ${duplicate.published_url}` : ''}`,
    })

    const msg = `Duplicate detected on @${account.username} (${matchedBy}) — skipping upload${duplicate.published_url ? `, existing: ${duplicate.published_url}` : ''}`
    ctx.logger.info(msg)
    return { action: 'continue', data: null, message: msg }
  }

  const publisher = new VideoPublisher()
  const publishStartedAt = Date.now()
  const result = await publisher.publish(video.local_path, caption, cookies, (msg) => {
    ctx.onProgress(`[Playwright] ${msg}`)
  }, {
    privacy: ctx.params.privacy || 'public',
    username: account.username,
  })

  if (!result.success) {
    if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
    if (result.debugArtifacts) {
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'publish:debug', {
        videoId: video.platform_id, success: false, errorType: result.errorType,
        error: result.error, warning: result.warning, debugArtifacts: result.debugArtifacts,
      })
    }

    if (result.errorType === 'captcha') {
      ctx.logger.info(`CAPTCHA detected for video ${video.platform_id} - skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'captcha:detected', {
        videoId: video.platform_id, debugArtifacts: result.debugArtifacts,
      })
      setVideoStatus(ctx, video.platform_id, 'captcha')
      return { action: 'continue', data: { ...video, status: 'captcha' } }
    }

    if (result.errorType === 'violation') {
      ctx.logger.info(`Content violation for video ${video.platform_id} - skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'violation:detected', {
        videoId: video.platform_id, error: result.error, debugArtifacts: result.debugArtifacts,
        description: video.description, author: video.author,
      })
      setVideoStatus(ctx, video.platform_id, 'violation')
      return { action: 'continue', data: { ...video, status: 'violation' } }
    }

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'publish:failed', {
      videoId: video.platform_id, error: result.error,
      description: video.description, author: video.author,
    })
    throw new Error(`Publish failed: ${result.error}`)
  }

  const emitPublishStatus = (payload: any) => {
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
      videoId: video.platform_id, ...payload,
    })
  }
  const isVerificationIncomplete = !!(result.verificationIncomplete || result.publishStatus === 'verification_incomplete')

  const publishHistoryId = insertPublishHistoryRecord({
    accountId: account.id, accountUsername: account.username, campaignId: ctx.campaign_id,
    sourcePlatformId, sourceLocalPath: video.local_path, fileFingerprint, captionHash,
    captionPreview: captionShort, publishedVideoId: result.videoId, publishedUrl: result.videoUrl,
    status: result.isReviewing ? 'under_review' : 'published', mediaSignature,
  })

  if (isVerificationIncomplete) {
    setVideoStatus(ctx, video.platform_id, 'verification_incomplete', result.videoUrl)
    updatePublishHistoryRecord(publishHistoryId, {
      status: 'published', publishedVideoId: result.videoId,
      publishedUrl: result.videoUrl, mediaSignature,
    })
    emitPublishStatus({
      status: 'verification_incomplete', videoUrl: result.videoUrl,
      message: 'Upload submitted, but dashboard verification was incomplete.',
      attempts: 0, maxRetries: 0,
    })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
      videoId: video.platform_id, videoUrl: result.videoUrl,
      warning: [result.warning, 'dashboard_verification_incomplete'].filter(Boolean).join(' | '),
      isReviewing: false, verificationIncomplete: true, debugArtifacts: result.debugArtifacts,
    })
    if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
    ctx.logger.info(`Published (verification incomplete): ${result.videoUrl || 'unknown url'}`)
    return {
      data: { ...video, published_url: result.videoUrl, published: true, status: 'verification_incomplete', verification_incomplete: true }
    }
  }

  if (result.isReviewing) {
    setVideoStatus(ctx, video.platform_id, 'under_review', result.videoUrl)

    const allStats = loadReviewStats()
    const statsKey = `tiktok:${account.id}:${account.username}`
    const predictedReviewMs = allStats[statsKey]?.avgReviewMs
    const maxRetries = Math.max(5, Math.min(10, Number(ctx.params.publishVerifyMaxRetries) || 5))

    emitPublishStatus({
      status: 'under_review', videoUrl: result.videoUrl,
      message: predictedReviewMs
        ? `Under content review. Estimated public in ~${Math.round(predictedReviewMs / 60000)} min.`
        : 'Under content review. Will retry every 2-3 minutes.',
      attempts: 0, maxRetries, predictedReviewMs,
    })

    let finalResult = result
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delayMs = estimateRetryDelayMs(allStats[statsKey], attempt)
      const nextRetryAt = Date.now() + delayMs
      emitPublishStatus({
        status: 'under_review', videoUrl: finalResult.videoUrl || result.videoUrl,
        message: `Under review, retry in ${Math.round(delayMs / 60000)}-${Math.ceil(delayMs / 60000)} min.`,
        attempts: attempt - 1, maxRetries, nextRetryAt, predictedReviewMs,
      })

      ctx.onProgress(`Under content review. Retry ${attempt}/${maxRetries} in ${Math.round(delayMs / 1000)}s...`)
      await new Promise(res => setTimeout(res, delayMs))

      setVideoStatus(ctx, video.platform_id, 'verifying_publish')
      emitPublishStatus({
        status: 'verifying_publish', videoUrl: finalResult.videoUrl || result.videoUrl,
        message: `Retry ${attempt}/${maxRetries}: reloading dashboard...`,
        attempts: attempt, maxRetries,
      })

      const recheck = await publisher.recheckPublishedStatus(cookies, (msg) => {
        ctx.onProgress(`[Playwright][Retry ${attempt}/${maxRetries}] ${msg}`)
      }, {
        privacy: ctx.params.privacy || 'public', username: account.username,
        uploadStartTime: Math.floor(publishStartedAt / 1000),
        expectedVideoId: finalResult.videoId || result.videoId,
        expectedVideoUrl: finalResult.videoUrl || result.videoUrl,
        expectedCaption: caption,
      })

      if (!recheck.success) {
        emitPublishStatus({
          status: 'under_review', videoUrl: finalResult.videoUrl || result.videoUrl,
          message: `Retry ${attempt}/${maxRetries} verify failed (${recheck.error || 'unknown'}).`,
          attempts: attempt, maxRetries,
        })
        continue
      }

      if (recheck.verificationIncomplete || recheck.publishStatus === 'verification_incomplete') {
        finalResult = { ...finalResult, ...recheck, videoUrl: recheck.videoUrl || finalResult.videoUrl }
        updatePublishHistoryRecord(publishHistoryId, {
          status: 'published', publishedVideoId: finalResult.videoId || recheck.videoId,
          publishedUrl: finalResult.videoUrl || recheck.videoUrl, mediaSignature,
        })
        setVideoStatus(ctx, video.platform_id, 'verification_incomplete', finalResult.videoUrl || result.videoUrl)
        emitPublishStatus({
          status: 'verification_incomplete', videoUrl: finalResult.videoUrl || result.videoUrl,
          message: `Retry ${attempt}/${maxRetries}: verification still incomplete.`,
          attempts: attempt, maxRetries,
        })
        ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
          videoId: video.platform_id, videoUrl: finalResult.videoUrl || result.videoUrl,
          warning: [finalResult.warning, 'dashboard_verification_incomplete_after_retry'].filter(Boolean).join(' | '),
          isReviewing: false, verificationIncomplete: true, debugArtifacts: finalResult.debugArtifacts,
        })
        ctx.logger.info(`Published (verification incomplete after retry): ${finalResult.videoUrl || result.videoUrl}`)
        return {
          data: { ...video, published_url: finalResult.videoUrl || result.videoUrl, published: true, status: 'verification_incomplete', verification_incomplete: true }
        }
      }

      finalResult = { ...finalResult, ...recheck, videoUrl: recheck.videoUrl || finalResult.videoUrl }
      updatePublishHistoryRecord(publishHistoryId, {
        status: recheck.isReviewing ? 'under_review' : 'published',
        publishedVideoId: finalResult.videoId || recheck.videoId,
        publishedUrl: finalResult.videoUrl || recheck.videoUrl, mediaSignature,
      })

      if (!recheck.isReviewing) {
        const reviewMs = Date.now() - publishStartedAt
        const prev = allStats[statsKey] || {}
        const samples = (prev.samples || 0) + 1
        const avgReviewMs = prev.avgReviewMs == null ? reviewMs : Math.round(prev.avgReviewMs * 0.7 + reviewMs * 0.3)
        allStats[statsKey] = { avgReviewMs, samples, lastReviewMs: reviewMs }
        saveReviewStats(allStats)

        setVideoStatus(ctx, video.platform_id, 'published', finalResult.videoUrl || result.videoUrl)

        emitPublishStatus({
          status: 'published', videoUrl: finalResult.videoUrl || result.videoUrl,
          message: `Video is public. Verified after ${Math.round(reviewMs / 60000)} minute(s).`,
          attempts: attempt, maxRetries, actualReviewMs: reviewMs, learnedAvgReviewMs: avgReviewMs,
        })
        ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
          videoId: video.platform_id, videoUrl: finalResult.videoUrl || result.videoUrl,
          warning: finalResult.warning, isReviewing: false,
          reviewVerifiedAfterMs: reviewMs, debugArtifacts: finalResult.debugArtifacts,
        })
        if (finalResult.warning) ctx.logger.info(`Publish warning: ${finalResult.warning}`)
        ctx.logger.info(`Published (verified public): ${finalResult.videoUrl || result.videoUrl}`)
        return { data: { ...video, published_url: finalResult.videoUrl || result.videoUrl, published: true, status: 'published' } }
      }

      setVideoStatus(ctx, video.platform_id, 'under_review', finalResult.videoUrl || result.videoUrl)
      emitPublishStatus({
        status: 'under_review', videoUrl: finalResult.videoUrl || result.videoUrl,
        message: `Still under review after retry ${attempt}/${maxRetries}.`,
        attempts: attempt, maxRetries,
      })
    }

    updatePublishHistoryRecord(publishHistoryId, {
      status: 'under_review', publishedVideoId: finalResult.videoId,
      publishedUrl: finalResult.videoUrl || result.videoUrl, mediaSignature,
    })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
      videoId: video.platform_id, videoUrl: finalResult.videoUrl || result.videoUrl,
      warning: [finalResult.warning, 'Still under content review after max retries'].filter(Boolean).join(' | '),
      isReviewing: true, debugArtifacts: finalResult.debugArtifacts,
      description: video.description, author: video.author,
    })
    return {
      data: { ...video, published_url: finalResult.videoUrl || result.videoUrl, published: true, status: 'under_review', under_review: true },
    }
  }

  // Direct success (no review needed)
  setVideoStatus(ctx, video.platform_id, 'published', result.videoUrl)
  updatePublishHistoryRecord(publishHistoryId, {
    status: 'published', publishedVideoId: result.videoId,
    publishedUrl: result.videoUrl, mediaSignature,
  })
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

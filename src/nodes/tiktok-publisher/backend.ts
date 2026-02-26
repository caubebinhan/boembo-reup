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

function estimateRetryDelayMs(stat?: ReviewRetryStats, attempt = 1): number {
  const minMs = 2 * 60 * 1000
  const maxMs = 3 * 60 * 1000
  if (!stat?.avgReviewMs) return attempt % 2 === 0 ? maxMs : minMs + 30000
  const target = Math.round(stat.avgReviewMs / 4)
  return Math.max(minMs, Math.min(maxMs, target))
}

/** DRY helper: update video status in campaign store + sync counters */
function setVideoStatus(ctx: NodeExecutionContext, platformId: string, status: string, publishUrl?: string) {
  try {
    ctx.store.updateVideo(platformId, { status, publish_url: publishUrl || undefined })
    // Sync counters for terminal statuses
    if (status === 'published') ctx.store.increment('published')
    else if (status === 'failed') ctx.store.increment('failed')
    else if (status === 'verification_incomplete') ctx.store.increment('verification_incomplete' as any)
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
    setVideoStatus(ctx, video.platform_id, 'failed')
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

  if (isVerificationIncomplete || result.isReviewing) {
    const status = isVerificationIncomplete ? 'verification_incomplete' : 'under_review'
    setVideoStatus(ctx, video.platform_id, status, result.videoUrl)

    updatePublishHistoryRecord(publishHistoryId, {
      status: result.isReviewing ? 'under_review' : 'published',
      publishedVideoId: result.videoId,
      publishedUrl: result.videoUrl, mediaSignature,
    })

    const allStats = loadReviewStats()
    const statsKey = `tiktok:${account.id}:${account.username}`
    const maxRetries = Math.max(5, Math.min(10, Number(ctx.params.publishVerifyMaxRetries) || 5))
    const retryIntervalMs = estimateRetryDelayMs(allStats[statsKey])

    // Schedule background async verification instead of blocking the loop
    const { taskId, created } = ctx.asyncTasks.schedule('tiktok.publish.verify', {
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

    const predictedReviewMs = allStats[statsKey]?.avgReviewMs
    emitPublishStatus({
      status,
      videoUrl: result.videoUrl,
      message: created
        ? `${status === 'verification_incomplete' ? 'Upload submitted (verification incomplete)' : 'Under content review'}. Background verification scheduled (${maxRetries} retries, ~${Math.round(retryIntervalMs / 60000)} min intervals).`
        : `Verification already scheduled (task ${taskId}).`,
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
    ctx.logger.info(`Published (${status}): ${result.videoUrl || 'unknown url'} — async verify task ${taskId} (${created ? 'created' : 'existing'})`)

    return {
      data: {
        ...video,
        published_url: result.videoUrl,
        published: true,
        status,
        asyncVerifyTaskId: taskId,
        ...(isVerificationIncomplete ? { verification_incomplete: true } : { under_review: true }),
      }
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

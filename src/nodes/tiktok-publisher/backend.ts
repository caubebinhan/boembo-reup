import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { ExecutionLogger } from '../../core/engine/ExecutionLogger'
import { VideoPublisher } from '../../main/tiktok/publisher/VideoPublisher'
import { selectPublishAccount } from '../../main/tiktok/publisher/PublishAccountResolver'
import {
  captionPreview,
  computeQuickFileFingerprint as computeFileFingerprint,
  findExactDuplicatePublishHistory as findDuplicatePublishHistory,
  hashCaption,
  insertPublishHistoryRecord,
  updatePublishHistoryRecord,
} from '../../main/tiktok/publisher/dedup/PublishDedupStore'

type ReviewRetryStats = {
  avgReviewMs?: number
  samples?: number
  lastReviewMs?: number
}

const REVIEW_STATS_KEY = 'tiktok_publish_review_retry_stats_v1'

function loadReviewStats(): Record<string, ReviewRetryStats> {
  try {
    const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(REVIEW_STATS_KEY) as any
    return row?.value_json ? JSON.parse(row.value_json) : {}
  } catch {
    return {}
  }
}

function saveReviewStats(stats: Record<string, ReviewRetryStats>) {
  try {
    db.prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(REVIEW_STATS_KEY, JSON.stringify(stats), Date.now())
  } catch {}
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
  if (!video?.local_path) throw new Error('No local video file to publish')

  const selection = selectPublishAccount(video, ctx)
  const account = selection.account

  const cookies = account.cookies_json ? JSON.parse(account.cookies_json) : null
  if (!cookies) throw new Error(`Account ${account.username} has no cookies`)

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
    const duplicateMessage = `Duplicate detected on @${account.username} (${matchedBy}) — skipping upload${duplicate.published_url ? `, existing: ${duplicate.published_url}` : ''}`

    try {
      db.prepare(`UPDATE videos SET status = 'duplicate', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
        .run(duplicate.published_url || null, video.platform_id, ctx.campaign_id)
    } catch (err) {
      ctx.logger.error('Failed to update duplicate status', err)
    }

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:duplicate-detected', {
      videoId: video.platform_id,
      accountId: account.id,
      accountUsername: account.username,
      matchedBy,
      existingStatus: duplicate.status,
      existingVideoId: duplicate.published_video_id,
      existingVideoUrl: duplicate.published_url,
      sourcePlatformId,
      fileFingerprint,
      captionHash,
    })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
      videoId: video.platform_id,
      status: 'duplicate',
      videoUrl: duplicate.published_url,
      accountUsername: account.username,
      message: `Duplicate on @${account.username} (${matchedBy})${duplicate.published_url ? `. Existing URL: ${duplicate.published_url}` : ''}`,
      duplicateStatus: duplicate.status,
      matchedBy,
    })

    ctx.logger.info(duplicateMessage)
    return { action: 'continue', data: null, message: duplicateMessage }
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
        videoId: video.platform_id,
        success: false,
        errorType: result.errorType,
        error: result.error,
        warning: result.warning,
        debugArtifacts: result.debugArtifacts,
      })
    }

    if (result.errorType === 'captcha') {
      ctx.logger.info(`CAPTCHA detected for video ${video.platform_id} - skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'captcha:detected', {
        videoId: video.platform_id,
        debugArtifacts: result.debugArtifacts,
      })
      try {
        db.prepare(`UPDATE videos SET status = 'captcha' WHERE platform_id = ? AND campaign_id = ?`).run(video.platform_id, ctx.campaign_id)
      } catch {}
      return { action: 'continue', data: { ...video, status: 'captcha' } }
    }

    if (result.errorType === 'violation') {
      ctx.logger.info(`Content violation for video ${video.platform_id} - skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'violation:detected', {
        videoId: video.platform_id,
        error: result.error,
        debugArtifacts: result.debugArtifacts,
      })
      try {
        db.prepare(`UPDATE videos SET status = 'violation' WHERE platform_id = ? AND campaign_id = ?`).run(video.platform_id, ctx.campaign_id)
      } catch {}
      return { action: 'continue', data: { ...video, status: 'violation' } }
    }

    throw new Error(`Publish failed: ${result.error}`)
  }

  const emitPublishStatus = (payload: any) => {
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:publish-status', {
      videoId: video.platform_id,
      ...payload,
    })
  }
  const isVerificationIncomplete = !!(result.verificationIncomplete || result.publishStatus === 'verification_incomplete')

  const publishHistoryId = insertPublishHistoryRecord({
    accountId: account.id,
    accountUsername: account.username,
    campaignId: ctx.campaign_id,
    sourcePlatformId,
    sourceLocalPath: video.local_path,
    fileFingerprint,
    captionHash,
    captionPreview: captionShort,
    publishedVideoId: result.videoId,
    publishedUrl: result.videoUrl,
    status: result.isReviewing ? 'under_review' : 'published',
    mediaSignature,
  })

  if (isVerificationIncomplete) {
    try {
      db.prepare(`UPDATE videos SET status = 'verification_incomplete', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
        .run(result.videoUrl || null, video.platform_id, ctx.campaign_id)
    } catch (err) {
      ctx.logger.error('Failed to update verification_incomplete status', err)
    }

    updatePublishHistoryRecord(publishHistoryId, {
      status: 'published',
      publishedVideoId: result.videoId,
      publishedUrl: result.videoUrl,
      mediaSignature,
    })

    emitPublishStatus({
      status: 'verification_incomplete',
      videoUrl: result.videoUrl,
      message: 'Upload submitted, but dashboard verification was incomplete. Skipping review retries. Check TikTok Studio manually.',
      attempts: 0,
      maxRetries: 0,
    })

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
      videoId: video.platform_id,
      videoUrl: result.videoUrl,
      warning: [result.warning, 'dashboard_verification_incomplete'].filter(Boolean).join(' | '),
      isReviewing: false,
      verificationIncomplete: true,
      debugArtifacts: result.debugArtifacts,
    })

    if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
    ctx.logger.info(`Published (verification incomplete): ${result.videoUrl || 'unknown url'}`)
    return {
      data: {
        ...video,
        published_url: result.videoUrl,
        published: true,
        status: 'verification_incomplete',
        verification_incomplete: true,
      }
    }
  }

  if (result.isReviewing) {
    try {
      db.prepare(`UPDATE videos SET status = 'under_review', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
        .run(result.videoUrl || null, video.platform_id, ctx.campaign_id)
    } catch (err) {
      ctx.logger.error('Failed to update under_review status', err)
    }

    const allStats = loadReviewStats()
    const statsKey = `tiktok:${account.id}:${account.username}`
    const predictedReviewMs = allStats[statsKey]?.avgReviewMs
    const maxRetries = Math.max(5, Math.min(10, Number(ctx.params.publishVerifyMaxRetries) || 5))

    emitPublishStatus({
      status: 'under_review',
      videoUrl: result.videoUrl,
      message: predictedReviewMs
        ? `Under content review. Estimated public in ~${Math.round(predictedReviewMs / 60000)} min. Will retry every 2-3 minutes.`
        : 'Under content review. Will retry every 2-3 minutes to verify publish status.',
      attempts: 0,
      maxRetries,
      predictedReviewMs,
    })

    let finalResult = result
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delayMs = estimateRetryDelayMs(allStats[statsKey], attempt)
      const nextRetryAt = Date.now() + delayMs
      emitPublishStatus({
        status: 'under_review',
        videoUrl: finalResult.videoUrl || result.videoUrl,
        message: `Under content review, will reload in ${Math.round(delayMs / 60000)}-${Math.ceil(delayMs / 60000)} minutes to verify publish status again.`,
        attempts: attempt - 1,
        maxRetries,
        nextRetryAt,
        predictedReviewMs,
      })

      ctx.onProgress(`Under content review. Retry ${attempt}/${maxRetries} in ${Math.round(delayMs / 1000)}s...`)
      await new Promise(res => setTimeout(res, delayMs))

      try {
        db.prepare(`UPDATE videos SET status = 'verifying_publish' WHERE platform_id = ? AND campaign_id = ?`)
          .run(video.platform_id, ctx.campaign_id)
      } catch {}
      emitPublishStatus({
        status: 'verifying_publish',
        videoUrl: finalResult.videoUrl || result.videoUrl,
        message: `Retry ${attempt}/${maxRetries}: reloading dashboard to verify publish status...`,
        attempts: attempt,
        maxRetries,
      })

      const recheck = await publisher.recheckPublishedStatus(cookies, (msg) => {
        ctx.onProgress(`[Playwright][Retry ${attempt}/${maxRetries}] ${msg}`)
      }, {
        privacy: ctx.params.privacy || 'public',
        username: account.username,
        uploadStartTime: Math.floor(publishStartedAt / 1000),
        expectedVideoId: finalResult.videoId || result.videoId,
        expectedVideoUrl: finalResult.videoUrl || result.videoUrl,
        expectedCaption: caption,
      })

      if (!recheck.success) {
        emitPublishStatus({
          status: 'under_review',
          videoUrl: finalResult.videoUrl || result.videoUrl,
          message: `Retry ${attempt}/${maxRetries} verify failed (${recheck.error || 'unknown'}). Will retry again.`,
          attempts: attempt,
          maxRetries,
        })
        continue
      }

      if (recheck.verificationIncomplete || recheck.publishStatus === 'verification_incomplete') {
        finalResult = { ...finalResult, ...recheck, videoUrl: recheck.videoUrl || finalResult.videoUrl }
        updatePublishHistoryRecord(publishHistoryId, {
          status: 'published',
          publishedVideoId: finalResult.videoId || recheck.videoId,
          publishedUrl: finalResult.videoUrl || recheck.videoUrl,
          mediaSignature,
        })
        try {
          db.prepare(`UPDATE videos SET status = 'verification_incomplete', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
            .run(finalResult.videoUrl || result.videoUrl || null, video.platform_id, ctx.campaign_id)
        } catch (err) {
          ctx.logger.error('Failed to update verification_incomplete status after retry', err)
        }
        emitPublishStatus({
          status: 'verification_incomplete',
          videoUrl: finalResult.videoUrl || result.videoUrl,
          message: `Retry ${attempt}/${maxRetries}: dashboard verification still incomplete. Stopping retries; check TikTok Studio manually.`,
          attempts: attempt,
          maxRetries,
        })

        ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
          videoId: video.platform_id,
          videoUrl: finalResult.videoUrl || result.videoUrl,
          warning: [finalResult.warning, 'dashboard_verification_incomplete_after_retry'].filter(Boolean).join(' | '),
          isReviewing: false,
          verificationIncomplete: true,
          debugArtifacts: finalResult.debugArtifacts,
        })

        if (finalResult.warning) ctx.logger.info(`Publish warning: ${finalResult.warning}`)
        ctx.logger.info(`Published (verification incomplete after retry): ${finalResult.videoUrl || result.videoUrl}`)
        return {
          data: {
            ...video,
            published_url: finalResult.videoUrl || result.videoUrl,
            published: true,
            status: 'verification_incomplete',
            verification_incomplete: true,
          }
        }
      }

      finalResult = { ...finalResult, ...recheck, videoUrl: recheck.videoUrl || finalResult.videoUrl }
      updatePublishHistoryRecord(publishHistoryId, {
        status: recheck.isReviewing ? 'under_review' : 'published',
        publishedVideoId: finalResult.videoId || recheck.videoId,
        publishedUrl: finalResult.videoUrl || recheck.videoUrl,
        mediaSignature,
      })
      if (!recheck.isReviewing) {
        const reviewMs = Date.now() - publishStartedAt
        const prev = allStats[statsKey] || {}
        const samples = (prev.samples || 0) + 1
        const avgReviewMs = prev.avgReviewMs == null ? reviewMs : Math.round(prev.avgReviewMs * 0.7 + reviewMs * 0.3)
        allStats[statsKey] = { avgReviewMs, samples, lastReviewMs: reviewMs }
        saveReviewStats(allStats)

        try {
          db.prepare(`UPDATE videos SET status = 'published', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
            .run(finalResult.videoUrl || result.videoUrl || null, video.platform_id, ctx.campaign_id)
        } catch (err) {
          ctx.logger.error('Failed to update publish status after review', err)
        }

        emitPublishStatus({
          status: 'published',
          videoUrl: finalResult.videoUrl || result.videoUrl,
          message: `Video is public. Verified after ${Math.round(reviewMs / 60000)} minute(s).`,
          attempts: attempt,
          maxRetries,
          actualReviewMs: reviewMs,
          learnedAvgReviewMs: avgReviewMs,
        })

        ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
          videoId: video.platform_id,
          videoUrl: finalResult.videoUrl || result.videoUrl,
          warning: finalResult.warning,
          isReviewing: false,
          reviewVerifiedAfterMs: reviewMs,
          debugArtifacts: finalResult.debugArtifacts,
        })

        if (finalResult.warning) ctx.logger.info(`Publish warning: ${finalResult.warning}`)
        ctx.logger.info(`Published (verified public): ${finalResult.videoUrl || result.videoUrl}`)
        return { data: { ...video, published_url: finalResult.videoUrl || result.videoUrl, published: true, status: 'published' } }
      }

      try {
        db.prepare(`UPDATE videos SET status = 'under_review', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
          .run(finalResult.videoUrl || result.videoUrl || null, video.platform_id, ctx.campaign_id)
      } catch {}
      emitPublishStatus({
        status: 'under_review',
        videoUrl: finalResult.videoUrl || result.videoUrl,
        message: `Still under content review after retry ${attempt}/${maxRetries}.`,
        attempts: attempt,
        maxRetries,
      })
    }

    updatePublishHistoryRecord(publishHistoryId, {
      status: 'under_review',
      publishedVideoId: finalResult.videoId,
      publishedUrl: finalResult.videoUrl || result.videoUrl,
      mediaSignature,
    })

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
      videoId: video.platform_id,
      videoUrl: finalResult.videoUrl || result.videoUrl,
      warning: [finalResult.warning, 'Still under content review after max retries'].filter(Boolean).join(' | '),
      isReviewing: true,
      debugArtifacts: finalResult.debugArtifacts,
    })

    return {
      data: {
        ...video,
        published_url: finalResult.videoUrl || result.videoUrl,
        published: true,
        status: 'under_review',
        under_review: true,
      },
    }
  }

  try {
    db.prepare(`UPDATE videos SET status = 'published', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
      .run(result.videoUrl, video.platform_id, ctx.campaign_id)
  } catch (err) {
    ctx.logger.error('Failed to update publish status', err)
  }

  updatePublishHistoryRecord(publishHistoryId, {
    status: 'published',
    publishedVideoId: result.videoId,
    publishedUrl: result.videoUrl,
    mediaSignature,
  })

  emitPublishStatus({
    status: 'published',
    videoUrl: result.videoUrl,
    message: 'Video is public and publish verification succeeded.',
    attempts: 0,
    maxRetries: 0,
  })

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
    videoId: video.platform_id,
    videoUrl: result.videoUrl,
    warning: result.warning,
    isReviewing: false,
    debugArtifacts: result.debugArtifacts,
  })

  if (result.warning) ctx.logger.info(`Publish warning: ${result.warning}`)
  ctx.logger.info(`Published: ${result.videoUrl}`)
  return { data: { ...video, published_url: result.videoUrl, published: true } }
}

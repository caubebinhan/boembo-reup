import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { attachPublishAccountTarget, selectPublishAccount } from '@main/tiktok/publisher/PublishAccountResolver'
import {
  compareMediaSignatures,
  computeMediaSignature,
  type MediaSignatureComputeResult,
} from '@main/tiktok/publisher/dedup/MediaSimilarity'
import {
  captionPreview,
  computeQuickFileFingerprint,
  findExactDuplicatePublishHistory,
  hashCaption,
  listPublishHistoryCandidates,
  parseMediaSignatureFromRow,
  updatePublishHistoryMediaSignature,
} from '@main/tiktok/publisher/dedup/PublishDedupStore'

type DedupMeta = {
  fileFingerprint?: string
  captionHash?: string
  captionPreview?: string
  mediaSignature?: any
}

function emitPublishStatus(ctx: NodeExecutionContext, videoId: string, payload: Record<string, any>) {
  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'account_dedup_1', 'video:publish-status', {
    videoId,
    ...payload,
  })
}

function markDuplicateAndSkip(
  ctx: NodeExecutionContext,
  video: any,
  account: any,
  duplicate: any,
  matchedBy: string,
  extra?: Record<string, any>
): NodeExecutionResult {
  const duplicateMessage = `Duplicate detected on @${account.username} (${matchedBy})${duplicate?.published_url ? `, existing: ${duplicate.published_url}` : ''}`

  try {
    ctx.store.updateVideo(video.platform_id, { status: 'duplicate', publish_url: duplicate?.published_url || undefined })
    ctx.store.save()
  } catch (err) {
    ctx.logger.error('Failed to update duplicate status', err)
  }

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'account_dedup_1', 'video:duplicate-detected', {
    videoId: video.platform_id,
    accountId: account.id,
    accountUsername: account.username,
    matchedBy,
    existingStatus: duplicate?.status,
    existingVideoId: duplicate?.published_video_id,
    existingVideoUrl: duplicate?.published_url,
    sourcePlatformId: String(video.platform_id || '').trim() || undefined,
    ...extra,
  })
  emitPublishStatus(ctx, video.platform_id, {
    status: 'duplicate',
    videoUrl: duplicate?.published_url,
    accountUsername: account.username,
    message: `Duplicate on @${account.username} (${matchedBy})${duplicate?.published_url ? `. Existing URL: ${duplicate.published_url}` : ''}`,
    duplicateStatus: duplicate?.status,
    matchedBy,
    ...extra,
  })

  ctx.logger.info(duplicateMessage)
  return { action: 'continue', data: null, message: duplicateMessage }
}

function shouldCompareAv(ctx: NodeExecutionContext): boolean {
  if (typeof ctx.params.publishDedupEnableAvSimilarity === 'boolean') {
    return ctx.params.publishDedupEnableAvSimilarity
  }
  return true
}

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  if (!video?.platform_id) throw new Error('No video platform_id for account dedup')
  if (!video?.local_path) throw new Error('No local video file for account dedup')

  const selection = selectPublishAccount(video, ctx)
  const account = selection.account
  const caption = video.generated_caption || video.description || ''
  const sourcePlatformId = String(video.platform_id || '').trim() || undefined
  const captionHash = hashCaption(caption)
  const captionShort = captionPreview(caption)
  const fileFingerprint = await computeQuickFileFingerprint(video.local_path).catch(() => undefined)
  const enrichedVideo = attachPublishAccountTarget(video, selection)

  ctx.logger.info(`Account dedup on @${account.username}`)

  const exact = findExactDuplicatePublishHistory(account.id, sourcePlatformId, fileFingerprint)
  if (exact) {
    const matchedBy = exact.source_platform_id && sourcePlatformId && exact.source_platform_id === sourcePlatformId
      ? 'source_platform_id'
      : (exact.file_fingerprint && fileFingerprint && exact.file_fingerprint === fileFingerprint)
        ? 'file_fingerprint'
        : 'exact_match'
    return markDuplicateAndSkip(ctx, enrichedVideo, account, exact, matchedBy, {
      fileFingerprint,
      captionHash,
    })
  }

  const dedupMeta: DedupMeta = {
    fileFingerprint,
    captionHash,
    captionPreview: captionShort,
  }

  if (shouldCompareAv(ctx)) {
    const threshold = Math.max(0.7, Math.min(0.999, Number(ctx.params.publishDedupSimilarityThreshold) || 0.93))
    const candidateLimit = Math.max(5, Math.min(100, Number(ctx.params.publishDedupHistoryScanLimit) || 20))
    const historyRows = listPublishHistoryCandidates(account.id, candidateLimit)

    if (historyRows.length > 0) {
      const currentSigResult: MediaSignatureComputeResult = await computeMediaSignature(video.local_path).catch((err: any) => ({
        skippedReason: String(err?.message || err),
      }))

      if (currentSigResult.signature) {
        dedupMeta.mediaSignature = currentSigResult.signature
        if (currentSigResult.warnings?.length) {
          ctx.logger.info(`Account dedup AV signature warnings: ${currentSigResult.warnings.join(' | ')}`)
        }

        let missingOriginalNotified = false
        for (const row of historyRows) {
          if (!row?.id) continue
          if (row.source_platform_id && sourcePlatformId && row.source_platform_id === sourcePlatformId) continue
          if (row.file_fingerprint && fileFingerprint && row.file_fingerprint === fileFingerprint) continue

          let rowSig = parseMediaSignatureFromRow(row)
          if (!rowSig) {
            const previousPath = String(row.source_local_path || '').trim()
            if (!previousPath) {
              updatePublishHistoryMediaSignature(row.id, null, 'dedup_signature_skipped:source_local_path_missing')
              continue
            }

            const rowSigResult: MediaSignatureComputeResult = await computeMediaSignature(previousPath).catch((err: any) => ({
              skippedReason: String(err?.message || err),
            }))

            if (rowSigResult.signature) {
              rowSig = rowSigResult.signature
              updatePublishHistoryMediaSignature(row.id, rowSig, rowSigResult.warnings?.[0])
            } else {
              const skipReason = rowSigResult.skippedReason || 'media_signature_extract_failed'
              updatePublishHistoryMediaSignature(row.id, null, `dedup_signature_skipped:${skipReason}`)
              if (skipReason === 'original_file_not_found' && !missingOriginalNotified) {
                missingOriginalNotified = true
                const msg = `Dedup scan skipped for some published records on @${account.username}: original file not found`
                emitPublishStatus(ctx, video.platform_id, { message: msg, accountUsername: account.username })
                ctx.logger.info(msg)
              }
              continue
            }
          }

          const sim = compareMediaSignatures(dedupMeta.mediaSignature, rowSig, threshold)
          if (sim.duplicate) {
            return markDuplicateAndSkip(ctx, enrichedVideo, account, row, 'av_similarity', {
              duplicateScore: sim.score,
              duplicateThreshold: sim.threshold,
              videoScore: sim.videoScore,
              audioScore: sim.audioScore,
              fileFingerprint,
              captionHash,
            })
          }
        }
      } else if (currentSigResult.skippedReason) {
        const msg = currentSigResult.skippedReason === 'original_file_not_found'
          ? `Dedup skipped due to original file not found (${video.local_path})`
          : `Dedup AV similarity skipped: ${currentSigResult.skippedReason}`
        emitPublishStatus(ctx, video.platform_id, { message: msg, accountUsername: account.username })
        ctx.logger.info(msg)
      }
    }
  }

  return {
    data: {
      ...enrichedVideo,
      publish_dedup_meta: dedupMeta,
    },
  }
}

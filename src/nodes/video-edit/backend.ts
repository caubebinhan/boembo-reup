/**
 * VideoEdit Node — Backend
 * ────────────────────────
 * Executes the video editing pipeline on each video in the campaign.
 * Reads `videoEditOps` from campaign params, runs enabled operations via FFmpeg,
 * and updates video records with edited file paths.
 */
import type { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { CodedError } from '@core/errors/CodedError'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { executeVideoEditPipeline, videoEditPluginRegistry } from '@core/video-edit'
import type { VideoEditOperation } from '@core/video-edit'
import { ffmpegProcessor } from '@main/ffmpeg/FFmpegAdapter'
import { statSync } from 'node:fs'

function normalizeProgressMessage(raw: string): string {
  return String(raw || '')
    .replace(/ﾂｷ/g, '|')
    .replace(/[•·]/g, '|')
    .replace(/\s+\|\s+/g, ' | ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export default async function execute(
  input: Record<string, any>,
  ctx: NodeExecutionContext,
): Promise<NodeExecutionResult> {
  // Input is the flat video object (same convention as downloader, caption-gen, publisher)
  const video = input
  if (!video?.local_path) {
    return { data: input, message: 'No local_path — passthrough (video not downloaded yet?)' }
  }

  const videoPath: string = video.local_path

  // Get operation configs from campaign params
  const operations: VideoEditOperation[] =
    ctx.params?.videoEditOps || []

  const enabledCount = operations.filter((o) => o.enabled).length
  if (enabledCount === 0) {
    // Auto-apply defaults (anti-detect plugins)
    const defaults = videoEditPluginRegistry.getDefaults()
    const hasEnabledDefaults = defaults.some((d) => d.enabled)
    if (!hasEnabledDefaults) {
      const skipMsg = 'Chỉnh sửa video bỏ qua: không có thao tác nào được bật.'
      ctx.logger.info(skipMsg)
      return { data: input, message: skipMsg }
    }
  }

  const videoId = video.platform_id || video.id || video.video_id
  ctx.logger.info(`VideoEdit: starting ${enabledCount || 'default'} operation(s) on ${videoPath}`)
  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:started', {
    videoId,
    operations: operations.filter((o) => o.enabled).map((o) => o.pluginId),
    message: `Video edit started for ${videoId}.`,
  })

  try {
    const result = await executeVideoEditPipeline({
      inputPath: videoPath,
      processor: ffmpegProcessor,
      operations: operations.length > 0 ? operations : undefined,
      assetResolver: (assetId) => {
        const assets = ctx.params?.videoEditAssets || {}
        return assets[assetId]?.path || assetId
      },
      onProgress: (msg) => ctx.onProgress(normalizeProgressMessage(msg)),
      onOperationApplied: (opId, pluginId, durationMs) => {
        ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:operation-applied', {
          videoId,
          operationId: opId,
          pluginId,
          durationMs,
          message: `Applied ${pluginId} on ${videoId}.`,
        })
      },
    })

    if (!result.wasModified) {
      ctx.logger.info('VideoEdit: no modifications applied')
      return { data: input, message: 'No video modifications applied' }
    }
    // Update video record in campaign store
    if (ctx.store?.updateVideo && video.platform_id) {
      await Promise.resolve(ctx.store.updateVideo(video.platform_id, { local_path: result.outputPath }))
    }

    // Compute output file size
    let fileSizeMB = 0
    try { fileSizeMB = Math.round(statSync(result.outputPath).size / 1024 / 1024 * 10) / 10 } catch {}

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:completed', {
      videoId,
      outputPath: result.outputPath,
      appliedOperations: result.appliedOperations,
      totalDurationMs: result.totalDurationMs,
      operationCount: result.appliedOperations.length,
      fileSizeMB,
      message: `Video edit completed for ${videoId} (${result.appliedOperations.length} operations).`,
    })

    ctx.logger.info(`VideoEdit complete: ${result.appliedOperations.length} operation(s) in ${result.totalDurationMs}ms`)

    return {
      data: {
        ...video,
        local_path: result.outputPath,
        original_path: video.original_path || videoPath,
        video_edit: {
          appliedOperations: result.appliedOperations,
          totalDurationMs: result.totalDurationMs,
          editedAt: Date.now(),
        },
      },
      message: `Edited with ${result.appliedOperations.length} operation(s)`,
    }
  } catch (error: any) {
    const msg = error.message || String(error)
    ctx.logger.error(`VideoEdit failed: ${msg}`)
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:failed', {
      videoId,
      error: msg,
      message: `Video edit failed for ${videoId}: ${msg}`,
    })

    // Mark the video as failed so the UI shows the edit failure reason
    if (ctx.store?.updateVideo && video.platform_id) {
      ctx.store.updateVideo(video.platform_id, {
        status: 'failed',
        data: { ...video, error: `Video edit failed: ${msg}` },
      })
      ctx.store.save()
    }

    // Hard fail — stop the pipeline for this video.
    // Common cause: FFmpeg not installed → "ffmpeg_or_ffprobe_not_available"
    const userMessage = msg.includes('ffmpeg_or_ffprobe_not_available')
      ? 'FFmpeg chưa được cài đặt. Vui lòng cài FFmpeg/FFprobe.'
      : `Chỉnh sửa video thất bại: ${msg}`

    ctx.alert('error', userMessage)
    const code = msg.includes('ffmpeg_or_ffprobe_not_available') ? 'DG-001' : 'DG-610'
    throw new CodedError(code, userMessage, error)
  }
}

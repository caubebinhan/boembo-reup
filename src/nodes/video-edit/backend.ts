/**
 * VideoEdit Node — Backend
 * ────────────────────────
 * Executes the video editing pipeline on each video in the campaign.
 * Reads `videoEditOperations` from campaign params, runs enabled operations via FFmpeg,
 * and updates video records with edited file paths.
 */
import type { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { executeVideoEditPipeline, videoEditPluginRegistry } from '@core/video-edit'
import type { VideoEditOperation } from '@core/video-edit'

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

  // Get operation configs from campaign params (multi-instance format)
  const operations: VideoEditOperation[] =
    ctx.params?.videoEditOperations || []

  // Fallback to legacy format
  const legacyConfigs = ctx.params?.videoEditPlugins

  const enabledCount = operations.filter((o) => o.enabled).length
  if (enabledCount === 0 && !legacyConfigs) {
    // Auto-apply defaults (anti-detect plugins)
    const defaults = videoEditPluginRegistry.getDefaults()
    const hasEnabledDefaults = defaults.some((d) => d.enabled)
    if (!hasEnabledDefaults) {
      ctx.logger.info('VideoEdit: no operations configured — passthrough')
      return { data: input, message: 'No video edit operations' }
    }
  }

  const videoId = video.platform_id || video.id || video.video_id
  ctx.logger.info(`VideoEdit: starting ${enabledCount || 'default'} operation(s) on ${videoPath}`)
  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:started', {
    videoId,
    operations: operations.filter((o) => o.enabled).map((o) => o.pluginId),
  })

  try {
    const result = await executeVideoEditPipeline({
      inputPath: videoPath,
      operations: operations.length > 0 ? operations : undefined,
      configs: legacyConfigs,
      assetResolver: (assetId) => {
        const assets = ctx.params?.videoEditAssets || {}
        return assets[assetId]?.path || assetId
      },
      onProgress: (msg) => ctx.onProgress(msg),
      onOperationApplied: (opId, pluginId, durationMs) => {
        ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:operation-applied', {
          videoId, operationId: opId, pluginId, durationMs,
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

    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:completed', {
      videoId,
      outputPath: result.outputPath,
      appliedOperations: result.appliedOperations,
      totalDurationMs: result.totalDurationMs,
    })

    ctx.logger.info(`VideoEdit: done in ${result.totalDurationMs}ms — ${result.appliedOperations.length} operation(s)`)

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
    ctx.logger.error(`VideoEdit failed: ${error.message}`)
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'video_edit_1', 'video-edit:failed', {
      videoId, error: error.message,
    })

    ctx.alert('warn', `Video edit failed: ${error.message}. Using original video.`)
    return { data: input, message: `Edit failed: ${error.message}` }
  }
}

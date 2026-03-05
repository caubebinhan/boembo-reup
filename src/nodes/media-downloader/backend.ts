import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { failGracefully } from '@core/nodes/NodeHelpers'
import { TikTokScanner } from '@main/tiktok/TikTokScanner'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { statSync } from 'node:fs'

const INSTANCE_ID = 'downloader_1'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  if (!video?.download_url && !video?.url) {
    const noUrlResult = failGracefully(ctx, INSTANCE_ID, video?.platform_id || 'unknown', 'no_download_url',
      'No download URL available', { suppressEvent: true })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, INSTANCE_ID, 'download:failed', {
      videoId: video?.platform_id || 'unknown',
      errorType: 'no_download_url',
      error: 'Không có URL tải video',
    })
    return noUrlResult
  }

  ctx.onProgress(`Đang tải: ${video.description?.slice(0, 40) || video.platform_id}`)
  const downloadStartMs = Date.now()
  const videoLabel = video.description?.slice(0, 40) || video.platform_id || 'video'
  ExecutionLogger.emitNodeEvent(ctx.campaign_id, INSTANCE_ID, 'video:downloading', {
    videoId: video.platform_id,
    url: video.download_url || video.url,
    message: `Đang tải ${videoLabel}...`,
  })

  let result: any
  try {
    const scanner = new TikTokScanner()
    const downloadUrl = video.download_url || video.url
    result = await scanner.downloadVideo(downloadUrl, video.platform_id)
  } catch (err: any) {
    const downloadResult = failGracefully(ctx, INSTANCE_ID, video.platform_id, 'download_failed',
      `Download failed: ${err?.message || err}`, { suppressEvent: true })
    ExecutionLogger.emitNodeEvent(ctx.campaign_id, INSTANCE_ID, 'download:failed', {
      videoId: video.platform_id,
      errorType: 'download_failed',
      error: err?.message || String(err),
      description: video.description,
    })
    return downloadResult
  }

  // Use real caption from the download API (scanner alt text includes music info)
  const realDescription = result.description || video.description

  // Update video in campaign document — preserve local_thumbnail if already set
  ctx.store.updateVideo(video.platform_id, {
    local_path: result.filePath,
    status: 'downloaded',
    data: {
      ...video,
      description: realDescription,
      author: video.author,
      stats: video.stats,
      thumbnail: typeof video.thumbnail === 'string' ? video.thumbnail : '',
      local_thumbnail: video.local_thumbnail || undefined,
    },
  })
  ctx.store.save()

  // Compute file size
  let fileSizeMB = 0
  try { fileSizeMB = Math.round(statSync(result.filePath).size / 1024 / 1024 * 10) / 10 } catch {}
  const downloadDurationMs = Date.now() - downloadStartMs

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, INSTANCE_ID, 'video:downloaded', {
    videoId: video.platform_id,
    fileSizeMB,
    downloadDurationMs,
    localPath: result.filePath,
    message: `Downloaded ${video.platform_id} (${fileSizeMB}MB in ${Math.round(downloadDurationMs / 1000)}s).`,
  })

  ctx.logger.info(`Download complete: ${result.filePath} (${fileSizeMB}MB, ${Math.round(downloadDurationMs / 1000)}s)`)
  return { data: { ...video, local_path: result.filePath, description: realDescription } }
}

import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'
import { db } from '../../main/db/Database'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export const VideoDownloaderNode: NodeDefinition = {
  id: 'core.downloader',
  name: 'Video Downloader',
  category: 'transform',
  icon: '⬇️',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const video = input
    if (!video?.download_url && !video?.url) {
      throw new Error('No download URL available')
    }

    ctx.onProgress(`Downloading: ${video.description?.slice(0, 40) || video.platform_id}`)

    const scanner = new TikTokScanner()
    const downloadUrl = video.download_url || video.url
    const result = await scanner.downloadVideo(downloadUrl, video.platform_id)

    try {
      db.prepare(`
        INSERT OR REPLACE INTO videos (platform_id, campaign_id, local_path, status, data_json)
        VALUES (?, ?, ?, 'downloaded', ?)
      `).run(
        video.platform_id,
        ctx.campaign_id,
        result.filePath,
        JSON.stringify({ description: video.description, author: video.author, stats: video.stats })
      )
    } catch (err) {
      ctx.logger.error('Failed to save video to DB', err)
    }

    ctx.logger.info(`Downloaded: ${result.filePath}`)
    return { data: { ...video, local_path: result.filePath } }
  }
}

nodeRegistry.register(VideoDownloaderNode)

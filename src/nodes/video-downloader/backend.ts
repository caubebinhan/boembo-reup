import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
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
      UPDATE videos 
      SET local_path = ?, 
          status = 'downloaded', 
          data_json = json_patch(data_json, ?)
      WHERE platform_id = ? AND campaign_id = ?
    `).run(
      result.filePath,
      JSON.stringify({
        description: video.description,
        author: video.author,
        stats: video.stats,
        thumbnail: video.thumbnail || '',
      }),
      video.platform_id,
      ctx.campaign_id
    )
  } catch (err) {
    ctx.logger.error('Failed to save video to DB', err)
  }

  ctx.logger.info(`Downloaded: ${result.filePath}`)
  return { data: { ...video, local_path: result.filePath } }
}

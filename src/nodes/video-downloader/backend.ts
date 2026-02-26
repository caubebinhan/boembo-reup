import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { TikTokScanner } from '@main/tiktok/TikTokScanner'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  if (!video?.download_url && !video?.url) {
    throw new Error('No download URL available')
  }

  ctx.onProgress(`Downloading: ${video.description?.slice(0, 40) || video.platform_id}`)

  const scanner = new TikTokScanner()
  const downloadUrl = video.download_url || video.url
  const result = await scanner.downloadVideo(downloadUrl, video.platform_id)

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
  ctx.store.increment('downloaded')
  ctx.store.save()

  ctx.logger.info(`Downloaded: ${result.filePath}${result.description ? ' (caption updated)' : ''}`)
  return { data: { ...video, local_path: result.filePath, description: realDescription } }
}

import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export const TikTokScannerNode: NodeDefinition = {
  id: 'tiktok.scanner',
  name: 'TikTok Scanner',
  category: 'source',
  icon: '🔍',

  async execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    // Read config from campaign params (saved by wizard)
    const sources = ctx.params.sources || []
    const maxVideos = ctx.params.max_videos || 50
    const sortOrder = ctx.params.sort_order || 'newest'

    const scanner = new TikTokScanner()
    const allVideos: any[] = []

    for (const source of sources) {
      if (!source) continue
      ctx.onProgress(`Scanning ${source.type}: ${source.name}`)

      try {
        let result: any = { videos: [] }

        if (source.type === 'channel') {
          result = await scanner.scanProfile(source.name, { limit: maxVideos, sortOrder })
        } else {
          result = await scanner.scanKeyword(source.name, { limit: maxVideos })
        }

        const mapped = (result.videos || []).map((v: any) => ({
          platform_id: v.platform_id || v.id,
          platform: 'tiktok',
          url: v.url,
          description: v.description || '',
          author: v.author || source.name,
          author_id: v.author_id || '',
          thumbnail: v.thumbnail || '',
          duration_seconds: v.duration_seconds || 0,
          stats: v.stats || {},
          tags: v.tags || [],
          created_at: v.created_at || Date.now(),
          download_url: v.download_url || '',
          source_meta: { source_type: source.type, source_name: source.name }
        }))

        allVideos.push(...mapped)
      } catch (err: any) {
        ctx.logger.error(`Failed to scan ${source.name}`, err)
      }
    }

    // Sort
    allVideos.sort((a, b) => {
      if (sortOrder === 'newest') return (b.created_at || 0) - (a.created_at || 0)
      if (sortOrder === 'oldest') return (a.created_at || 0) - (b.created_at || 0)
      if (sortOrder === 'most_liked') return (b.stats?.likes || 0) - (a.stats?.likes || 0)
      if (sortOrder === 'most_viewed') return (b.stats?.views || 0) - (a.stats?.views || 0)
      return 0
    })

    ctx.logger.info(`Scanner found ${allVideos.length} videos from ${sources.length} sources`)
    return { data: allVideos }
  }
}

nodeRegistry.register(TikTokScannerNode)

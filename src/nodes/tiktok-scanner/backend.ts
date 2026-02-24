import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export async function execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const sources = ctx.params.sources || []

  // Note: max_videos / sort_order are NOT in the wizard — per-source settings are used instead.
  // Kept as global fallbacks only for backward compatibility.
  const globalMaxVideos = ctx.params.max_videos ?? 50
  const globalSortOrder = ctx.params.sort_order ?? 'newest'

  const scanner = new TikTokScanner()
  const allVideos: any[] = []

  for (const source of sources) {
    if (!source) continue

    // Use per-source settings from Step2_Sources wizard (historyLimit, sortOrder, timeRange)
    const limit = source.historyLimit ?? globalMaxVideos
    const sortOrder = source.sortOrder ?? globalSortOrder
    const timeRange = source.timeRange ?? 'history_and_future'

    ctx.onProgress(`Scanning ${source.type}: ${source.name} (limit=${limit}, sort=${sortOrder}, range=${timeRange})`)
    ctx.logger.info(`[Scanner] source="${source.name}" type=${source.type} limit=${limit} sort=${sortOrder} timeRange=${timeRange}`)

    try {
      let result: any = { videos: [] }

      if (source.type === 'channel') {
        result = await scanner.scanProfile(source.name, {
          limit,
          sortOrder,
          timeRange,
          startDate: source.startDate,
          endDate: source.endDate,
        })
      } else {
        result = await scanner.scanKeyword(source.name, {
          limit,
          sortOrder,
          timeRange,
          startDate: source.startDate,
          endDate: source.endDate,
        })
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

  // Sort all results by the first source's sortOrder (or global fallback)
  const primarySort = sources[0]?.sortOrder ?? globalSortOrder
  allVideos.sort((a, b) => {
    if (primarySort === 'newest') return (b.created_at || 0) - (a.created_at || 0)
    if (primarySort === 'oldest') return (a.created_at || 0) - (b.created_at || 0)
    if (primarySort === 'most_liked') return (b.stats?.likes || 0) - (a.stats?.likes || 0)
    if (primarySort === 'most_viewed') return (b.stats?.views || 0) - (a.stats?.views || 0)
    return 0
  })

  ctx.logger.info(`Scanner found ${allVideos.length} videos from ${sources.length} sources`)
  return { data: allVideos }
}


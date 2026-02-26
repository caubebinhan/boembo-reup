import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { TikTokScanner } from '@main/tiktok/TikTokScanner'
import { accountRepo } from '@main/db/repositories/AccountRepo'

export async function execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const sources = ctx.params.sources || []

  // Resolve cookies for the campaign's publish account
  const accountId = ctx.params.account_id || ''
  const accounts = accountRepo.findAll() as any[]
  const account = accountId ? accounts.find(a => a.id === accountId) : accounts[0]
  const cookies = account?.cookies || []
  if (cookies.length > 0) {
    ctx.logger.info(`[Scanner] Using ${cookies.length} cookies from account @${account?.username}`)
  }

  const scanner = new TikTokScanner()
  const allVideos: any[] = []

  for (const source of sources) {
    if (!source) continue

    // Use per-source settings from Step2_Sources wizard
    const limit = source.historyLimit ?? 50
    const sortOrder = source.sortOrder ?? 'newest'
    const timeRange = source.timeRange ?? 'history_and_future'

    ctx.onProgress(`Scanning ${source.type}: ${source.name} (limit=${limit})`)
    ctx.logger.info(`[Scanner] source="${source.name}" type=${source.type} limit=${limit} sort=${sortOrder} timeRange=${timeRange}`)

    try {
      let result: any = { videos: [] }

      const scanOpts = { limit, sortOrder, timeRange, startDate: source.startDate, endDate: source.endDate, cookies }

      if (source.type === 'channel') {
        result = await scanner.scanProfile(source.name, scanOpts)
      } else {
        result = await scanner.scanKeyword(source.name, scanOpts)
      }

      const mapped = (result.videos || []).map((v: any) => ({
        platform_id: v.platform_id || v.id,
        platform: 'tiktok',
        url: v.url,
        description: v.description || '',
        author: v.author || source.name,
        author_id: v.author_id || '',
        thumbnail: typeof v.thumbnail === 'string' ? v.thumbnail : '',
        duration_seconds: v.duration_seconds || 0,
        stats: v.stats || {},
        tags: v.tags || [],
        created_at: v.created_at || Date.now(),
        download_url: v.download_url || '',
        source_meta: { source_type: source.type, source_name: source.name },
      }))

      allVideos.push(...mapped)
    } catch (err: any) {
      ctx.logger.error(`Failed to scan ${source.name}`, err)
    }
  }

  // Download thumbnails locally (non-blocking, parallel batches of 5)
  if (allVideos.length > 0) {
    ctx.onProgress(`📥 Downloading ${allVideos.length} thumbnails...`)
    const BATCH = 5
    for (let i = 0; i < allVideos.length; i += BATCH) {
      const batch = allVideos.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(v => scanner.downloadThumbnail(v.thumbnail, v.platform_id))
      )
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) {
          batch[idx].local_thumbnail = r.value
        }
      })
    }
  }

  ctx.logger.info(`Scanner found ${allVideos.length} videos from ${sources.length} sources`)
  ctx.onProgress(`🔍 Scanned ${allVideos.length} videos`)
  return { data: allVideos }
}

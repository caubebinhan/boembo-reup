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
  const sourceCounts: string[] = []

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

      const sourceLabel = source.type === 'channel' ? `@${source.name.replace('@','')}` : `🔑${source.name}`
      let mapped = (result.videos || []).map((v: any) => ({
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
        source_meta: {
          source_type: source.type,
          source_name: source.name,
          autoSchedule: source.autoSchedule !== false,
        },
      }))

      // ── Apply per-source filter conditions ────────────
      const beforeCount = mapped.length
      if (source.minLikes) {
        mapped = mapped.filter((v: any) => (v.stats?.diggCount || v.stats?.likes || 0) >= source.minLikes)
      }
      if (source.minViews) {
        mapped = mapped.filter((v: any) => (v.stats?.playCount || v.stats?.views || 0) >= source.minViews)
      }
      if (source.maxViews) {
        mapped = mapped.filter((v: any) => (v.stats?.playCount || v.stats?.views || 0) <= source.maxViews)
      }
      if (source.withinDays) {
        const cutoff = Date.now() - source.withinDays * 24 * 60 * 60 * 1000
        mapped = mapped.filter((v: any) => (v.created_at || Date.now()) >= cutoff)
      }

      const filteredOut = beforeCount - mapped.length
      if (filteredOut > 0) {
        ctx.logger.info(`[Scanner] Filtered out ${filteredOut}/${beforeCount} videos from ${sourceLabel} (minLikes=${source.minLikes || '-'}, minViews=${source.minViews || '-'}, maxViews=${source.maxViews || '-'}, withinDays=${source.withinDays || '-'})`)
      }

      allVideos.push(...mapped)
      sourceCounts.push(`${sourceLabel}: ${mapped.length}`)
      ctx.onProgress(`✅ ${sourceLabel}: ${mapped.length} videos${filteredOut > 0 ? ` (${filteredOut} filtered)` : ''}`)
    } catch (err: any) {
      ctx.logger.error(`Failed to scan ${source.name}`, err)
    }
  }

  // Build summary progress with per-source breakdown
  const summary = sources.length > 1
    ? `🔍 ${allVideos.length} videos (${sourceCounts.join(', ')})`
    : `🔍 Scanned ${allVideos.length} videos`
  ctx.logger.info(`Scanner found ${allVideos.length} videos from ${sources.length} sources`)
  ctx.onProgress(summary)

  // Schedule thumbnail downloads as async task (crash-recoverable)
  if (allVideos.length > 0) {
    const videosToDownload = allVideos.filter(v => v.thumbnail)
    if (videosToDownload.length > 0) {
      const campaignId = ctx.params.campaign_id || ctx.params.campaignId || ''
      ctx.asyncTasks.schedule('tiktok.thumbnail.batch', {
        campaignId,
        videos: videosToDownload.map(v => ({
          platform_id: v.platform_id,
          thumbnailUrl: v.thumbnail,
        })),
      }, {
        dedupeKey: `thumb-batch:${campaignId}:${Date.now()}`,
        maxAttempts: 3,
        firstRunAt: Date.now() + 2000, // slight delay, let scanner finish first
        campaignId,
        ownerKey: `campaign:${campaignId}:thumbnails`,
      })
      ctx.logger.info(`[Scanner] Scheduled thumbnail batch task for ${videosToDownload.length} videos`)
    }
  }

  return { data: allVideos }
}

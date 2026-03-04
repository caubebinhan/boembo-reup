import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { TikTokScanner, ScanOptions } from '@main/tiktok/TikTokScanner'

/**
 * Monitoring Node
 *
 * Continuous loop: scan sources -> sleep -> scan again.
 * If new videos are found, return to scheduler.
 * If campaign is paused/stopped, exit gracefully.
 */
export async function execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const intervalMinutes = ctx.params.monitorIntervalMinutes ?? 5
  const waitMs = intervalMinutes * 60 * 1000

  ctx.logger.info(`[Monitor] Starting continuous monitoring (interval=${intervalMinutes}min)`)
  ctx.onProgress(`Monitoring started (interval ${intervalMinutes}min).`)

  while (true) {
    ctx.onProgress(`Waiting ${intervalMinutes}min before next scan...`)
    await new Promise((resolve) => setTimeout(resolve, waitMs))

    // Check campaign status from store (re-read fresh)
    const { campaignRepo } = require('../../main/db/repositories/CampaignRepo')
    const freshStore = campaignRepo.tryOpen(ctx.campaign_id)
    if (!freshStore || !['active', 'running'].includes(freshStore.status)) {
      ctx.logger.info(`[Monitor] Campaign status=${freshStore?.status} - stopping monitor`)
      ctx.onProgress('Monitoring stopped (campaign paused/stopped).')
      return { data: [], action: 'continue', message: 'Campaign paused/stopped - monitoring ended' }
    }

    const params = freshStore.params
    const sources = params.sources || []
    const lastScanTimes = params.last_scan_times || {}

    if (sources.length === 0) {
      ctx.logger.info('[Monitor] No sources configured - skipping scan')
      continue
    }

    // Known video IDs for dedup
    const knownIds = new Set(ctx.store.videos.map((v) => v.platform_id))

    const scanner = new TikTokScanner()
    const newVideos: any[] = []
    let totalScanned = 0
    let updatedScanTimes = false

    for (const source of sources) {
      const sourceKey = `${source.type}_${source.name}`
      const lastScanAt = lastScanTimes[sourceKey] || 0

      // Use "since last scan" semantics for monitoring.
      const sinceLastScan = lastScanAt
        ? new Date(lastScanAt).toISOString().split('T')[0]
        : source.startDate

      const effectiveTimeRange: ScanOptions['timeRange'] =
        source.timeRange === 'future_only' || sinceLastScan
          ? 'custom_range'
          : (source.timeRange ?? 'history_and_future')

      const scanOpts: ScanOptions = {
        limit: source.historyLimit || 30,
        sortOrder: source.sortOrder ?? 'newest',
        timeRange: effectiveTimeRange,
        startDate: sinceLastScan,
        endDate: source.endDate,
      }

      try {
        ctx.onProgress(`Scanning ${source.type}: ${source.name}...`)

        let result
        if (source.type === 'channel') {
          result = await scanner.scanProfile(source.name, scanOpts)
        } else {
          result = await scanner.scanKeyword(source.name, scanOpts)
        }

        totalScanned += result.videos.length
        const fresh = result.videos.filter((v) => !knownIds.has(v.platform_id))

        if (fresh.length > 0) {
          newVideos.push(...fresh)
          ctx.logger.info(`[Monitor] Source "${source.name}": ${fresh.length} new videos`)
          const maxCreatedAt = Math.max(...fresh.map((v) => v.created_at))
          lastScanTimes[sourceKey] = maxCreatedAt
          updatedScanTimes = true
        }
      } catch (err: any) {
        ctx.logger.error(`[Monitor] Error scanning "${source.name}": ${err.message}`)
      }
    }

    // Save updated last_scan_times
    if (updatedScanTimes) {
      ctx.store.doc.params = { ...params, last_scan_times: lastScanTimes }
      ctx.store.save()
    }

    if (newVideos.length > 0) {
      ctx.logger.info(`[Monitor] Found ${newVideos.length} new videos - sending to scheduler`)
      ctx.onProgress(`Found ${newVideos.length} new videos.`)
      return { data: newVideos, action: 'continue', message: `${newVideos.length} new videos detected` }
    }

    ctx.logger.info(`[Monitor] Scanned ${totalScanned} videos - no new ones.`)
    ctx.onProgress(`No new videos. Next scan in ${intervalMinutes}min.`)
  }
}

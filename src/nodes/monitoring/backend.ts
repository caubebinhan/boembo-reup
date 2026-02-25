import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { TikTokScanner, ScanOptions } from '../../main/tiktok/TikTokScanner'

/**
 * Monitoring Node
 *
 * Runs an infinite internal loop: scan sources → sleep → scan again.
 * When new videos are found, returns them to be fed into the scheduler.
 * When campaign is paused/stopped, exits gracefully.
 *
 * Crash recovery: Tracks `last_scan_times` (map of source -> timestamp) 
 * in the database under campaign `params`. Uses `timeRange: 'custom_range'`
 * to fetch ONLY videos newer than the last tracked timestamp.
 */
export async function execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const intervalMinutes = ctx.params.monitorIntervalMinutes ?? 5
  const waitMs = intervalMinutes * 60 * 1000

  ctx.logger.info(`[Monitor] Starting continuous monitoring (interval=${intervalMinutes}min)`)
  ctx.onProgress(`👁 Monitoring bắt đầu (mỗi ${intervalMinutes} phút)...`)

  // ── Infinite monitoring loop ──────────────────────
  while (true) {
    // 1. Wait for the configured interval
    ctx.onProgress(`💤 Đợi ${intervalMinutes} phút trước khi quét...`)
    await new Promise(resolve => setTimeout(resolve, waitMs))

    // 2. Check campaign status — exit if paused/stopped
    const campaign = db.prepare('SELECT status, params FROM campaigns WHERE id = ?').get(ctx.campaign_id) as any
    if (!campaign || !['active', 'running'].includes(campaign.status)) {
      ctx.logger.info(`[Monitor] Campaign status=${campaign?.status} — stopping monitor`)
      ctx.onProgress('⏸ Monitoring dừng (campaign paused)')
      return {
        data: [],
        action: 'continue',
        message: 'Campaign paused/stopped — monitoring ended',
      }
    }

    // 3. Parse campaign params for sources and last_scan_times
    const params = typeof campaign.params === 'string' ? JSON.parse(campaign.params) : campaign.params || {}
    const sources = params.sources || []
    const lastScanTimes = params.last_scan_times || {}

    if (sources.length === 0) {
      ctx.logger.info('[Monitor] No sources configured — skipping scan')
      continue
    }

    // 4. Get already-known video IDs for this campaign (dedup fallback)
    const knownVideos = db.prepare(
      'SELECT platform_id FROM videos WHERE campaign_id = ?'
    ).all(ctx.campaign_id) as any[]
    const knownIds = new Set(knownVideos.map((v: any) => v.platform_id))

    // 5. Re-scan all sources
    const scanner = new TikTokScanner()
    const newVideos: any[] = []
    let totalScanned = 0
    let updatedScanTimes = false

    for (const source of sources) {
      const sourceKey = `${source.type}_${source.name}`
      const lastScanAt = lastScanTimes[sourceKey] || 0

      // Use custom_range to enforce fetching only NEW videos 
      // (created after lastScanAt)
      const scanOpts: ScanOptions = {
        limit: source.limit || params.max_videos || 30,
        sortOrder: 'newest', // Always newest for monitoring
        timeRange: 'custom_range',
        startDate: lastScanAt ? new Date(lastScanAt).toISOString() : undefined,
      }

      try {
        ctx.onProgress(`🔍 Đang quét ${source.type}: ${source.name}...`)

        let result
        if (source.type === 'channel') {
          result = await scanner.scanProfile(source.name, scanOpts)
        } else {
          result = await scanner.scanKeyword(source.name, scanOpts)
        }

        totalScanned += result.videos.length

        // Filter out already-known videos (fallback check)
        const fresh = result.videos.filter(v => !knownIds.has(v.platform_id))
        
        if (fresh.length > 0) {
          newVideos.push(...fresh)
          ctx.logger.info(`[Monitor] Source "${source.name}": ${fresh.length} new videos (since ${new Date(lastScanAt).toLocaleString()})`)
          
          // Update last_scan_time for this source to the max created_at
          const maxCreatedAt = Math.max(...fresh.map(v => v.created_at))
          lastScanTimes[sourceKey] = maxCreatedAt
          updatedScanTimes = true
        }
      } catch (err: any) {
        ctx.logger.error(`[Monitor] Error scanning "${source.name}": ${err.message}`)
      }
    }

    // 6. Save updated last_scan_times back to campaign DB
    if (updatedScanTimes) {
      const newParams = { ...params, last_scan_times: lastScanTimes }
      db.prepare('UPDATE campaigns SET params = ? WHERE id = ?').run(JSON.stringify(newParams), ctx.campaign_id)
    }

    // 7. If new videos found → return them to scheduler
    if (newVideos.length > 0) {
      ctx.logger.info(`[Monitor] 🆕 Found ${newVideos.length} new videos — sending to scheduler`)
      ctx.onProgress(`🆕 ${newVideos.length} video mới! Đang gửi vào scheduler...`)

      return {
        data: newVideos,
        action: 'continue',
        message: `${newVideos.length} new videos detected`,
      }
    }

    // 8. No new videos → log and continue loop
    ctx.logger.info(`[Monitor] Scanned ${totalScanned} videos — no new ones. Retrying in ${intervalMinutes}min...`)
    ctx.onProgress(`👁 Không có video mới. Quét lại sau ${intervalMinutes} phút...`)
    // Loop continues...
  }
}

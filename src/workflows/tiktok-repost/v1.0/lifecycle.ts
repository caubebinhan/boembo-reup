/**
 * TikTok Repost — Workflow Lifecycle Hooks
 *
 * Runs workflow-specific logic at campaign lifecycle events:
 * - beforeStart: health checks (disk space, TikTok reachability)
 * - onDelete: clean up downloaded media files
 *
 * Auto-discovered by src/workflows/index.ts via lifecycle.ts convention.
 */
import type { WorkflowLifecycle } from '@core/flow/WorkflowLifecycle'
import { AppSettingsService } from '@main/services/AppSettingsService'
import { getFreeDiskSpaceMB } from '@main/utils/diskSpace'

const lifecycle: WorkflowLifecycle = {
  async beforeStart(_campaignId, _params) {
    const errors: string[] = []

    // 1. Disk space check
    try {
      const mediaPath = AppSettingsService.getMediaStoragePath()
      const freeMB = await getFreeDiskSpaceMB(mediaPath)
      if (freeMB >= 0 && freeMB < 100) {
        errors.push(`Insufficient disk space: only ${freeMB} MB free (minimum 100 MB required)`)
      }
    } catch (err: any) {
      // Non-blocking — log but don't prevent start
      console.warn(`[tiktok-repost/lifecycle] Storage check failed: ${err?.message}`)
    }

    // 2. TikTok reachability check
    try {
      const { net } = await import('electron')
      const urls = [
        { name: 'TikTok', url: 'https://www.tiktok.com' },
        { name: 'TikTok Studio', url: 'https://www.tiktok.com/tiktokstudio' },
      ]
      for (const { name, url } of urls) {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          await net.fetch(url, { method: 'HEAD', signal: controller.signal })
          clearTimeout(timeout)
        } catch {
          errors.push(`${name} unreachable (${url})`)
        }
      }
    } catch (err: any) {
      console.warn(`[tiktok-repost/lifecycle] Service check failed: ${err?.message}`)
    }

    return { ok: errors.length === 0, errors }
  },

  async onDelete(campaignId, _params) {
    // Clean up downloaded media files for this campaign
    try {
      const mediaPath = AppSettingsService.getMediaStoragePath()
      const campaignDir = `${mediaPath}/${campaignId}`
      const fs = await import('node:fs')
      if (fs.existsSync(campaignDir)) {
        fs.rmSync(campaignDir, { recursive: true, force: true })
        console.log(`[tiktok-repost/lifecycle] Cleaned media dir: ${campaignDir}`)
      }
    } catch (err: any) {
      console.warn(`[tiktok-repost/lifecycle] Failed to clean media: ${err?.message}`)
    }
  },
}

export default lifecycle

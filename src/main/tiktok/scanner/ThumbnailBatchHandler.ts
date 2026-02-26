import type { AsyncTaskHandler, AsyncTaskDocument, AsyncTaskDecision, LeaseHeartbeat } from '@core/async-tasks/types'
import { TikTokScanner } from '@main/tiktok/TikTokScanner'
import { campaignRepo } from '@main/db/repositories/CampaignRepo'

/**
 * ThumbnailBatchHandler — async task handler for downloading thumbnails.
 *
 * Payload: { campaignId, videos: [{ platform_id, thumbnailUrl }] }
 * State:   { downloaded: string[] }  ← persisted cursor across retries
 *
 * On crash recovery: already-downloaded IDs are in state.downloaded,
 * so only remaining thumbnails get processed.
 */
export const thumbnailBatchHandler: AsyncTaskHandler = {
  taskType: 'tiktok.thumbnail.batch',
  estimatedMaxExecutionMs: 300_000, // 5 min for large batches

  validate(payload, version) {
    if (version !== 1) return `Unsupported payload version: ${version}`
    if (!payload.campaignId) return 'Missing campaignId'
    if (!Array.isArray(payload.videos) || payload.videos.length === 0) return 'Missing or empty videos'
    return null
  },

  async execute(task: AsyncTaskDocument, heartbeat: LeaseHeartbeat): Promise<AsyncTaskDecision> {
    const { campaignId, videos } = task.payload
    const downloaded: string[] = Array.isArray(task.state.downloaded) ? [...task.state.downloaded] : []
    const remaining = videos.filter((v: any) => !downloaded.includes(v.platform_id))

    if (remaining.length === 0) {
      return { action: 'complete', result: { total: videos.length, downloaded: downloaded.length } }
    }

    const scanner = new TikTokScanner()
    const BATCH = 5
    let failed = 0

    for (let i = 0; i < remaining.length; i += BATCH) {
      const batch = remaining.slice(i, i + BATCH)
      heartbeat.extend()

      const results = await Promise.allSettled(
        batch.map((v: any) => scanner.downloadThumbnail(v.thumbnailUrl, v.platform_id))
      )

      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        const video = batch[j]
        if (r.status === 'fulfilled' && r.value) {
          downloaded.push(video.platform_id)
          // Update campaign store with local thumbnail path
          try {
            const store = campaignRepo.tryOpen(campaignId)
            if (store) {
              store.updateVideo(video.platform_id, { local_thumbnail: r.value })
              store.save()
            }
          } catch { /* ignore */ }
        } else {
          failed++
        }
      }
    }

    if (downloaded.length < videos.length && failed > 0) {
      // Some failed — reschedule to retry remaining
      return {
        action: 'reschedule',
        nextRunAt: Date.now() + 60_000, // retry in 1 min
        patchState: { downloaded },
      }
    }

    return {
      action: 'complete',
      result: {
        total: videos.length,
        downloaded: downloaded.length,
        failed,
      },
    }
  },
}

// Self-register (triggered by import from workflow services.ts)
import { asyncTaskRegistry } from '@core/async-tasks'
asyncTaskRegistry.register(thumbnailBatchHandler)

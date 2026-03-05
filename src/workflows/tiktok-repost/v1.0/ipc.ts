/**
 * TikTok Repost — Workflow-specific IPC handlers
 *
 * Auto-loaded by src/workflows/index.ts via ipc.ts convention.
 * Register only IPC handlers that are specific to this workflow here.
 *
 * NOTE: video-edit:get-plugin-metas and video-edit:get-defaults are
 * registered centrally in main/ipc/video-editor.ts — do NOT duplicate here.
 */
import { ipcMain, BrowserWindow, shell } from 'electron'
import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { normalizeTimeRanges, nextValidSlot } from '@nodes/_shared/timeWindow'
import { IPC_CHANNELS } from '@shared/ipc-types'

/** Guard against duplicate handler registration on hot-reload */
const safeHandle = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export function setup() {
  // ── Videos by campaign ────────────────────────────────
  safeHandle(IPC_CHANNELS.CAMPAIGN_GET_VIDEOS, async (_event, { id }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return []
    return store.videos.sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0))
  })

  // ── Alerts by campaign ────────────────────────────────
  safeHandle(IPC_CHANNELS.CAMPAIGN_GET_ALERTS, async (_event, { id, limit }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return []
    const alerts = store.alerts.sort((a, b) => b.created_at - a.created_at)
    return limit ? alerts.slice(0, limit) : alerts
  })

  // ── Reschedule a single video ─────────────────────────
  safeHandle(IPC_CHANNELS.VIDEO_RESCHEDULE, async (_event, { platformId, campaignId, scheduledFor }) => {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return { success: false }
    store.updateVideo(platformId, { scheduled_for: scheduledFor })
    store.save()
    return { success: true }
  })

  // ── Show video file in system explorer ────────────────
  safeHandle(IPC_CHANNELS.VIDEO_SHOW_IN_EXPLORER, async (_event, payload) => {
    const filePath = typeof payload === 'string' ? payload : payload?.path
    if (filePath) shell.showItemInFolder(filePath)
  })

  // ── Reschedule ALL queued videos with new params ──────
  safeHandle(IPC_CHANNELS.CAMPAIGN_RESCHEDULE_ALL, async (_event, { id }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return { success: false, error: 'Campaign not found' }

    const params = store.params
    const publishIntervalMinutes = params.publishIntervalMinutes ?? 60
    const intervalMs = publishIntervalMinutes * 60 * 1000
    const ranges = normalizeTimeRanges(params)

    const queuedVideos = store.videosByStatus('queued')
      .sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0))

    if (queuedVideos.length === 0) return { success: true, count: 0 }

    let cursor = Date.now()
    for (const v of queuedVideos) {
      cursor = nextValidSlot(cursor, ranges)
      v.scheduled_for = cursor
      cursor += intervalMs
    }
    store.save()

    ExecutionLogger.log({
      campaign_id: id,
      instance_id: 'scheduler_1',
      node_id: 'core.publish_scheduler',
      level: 'info',
      event: 'videos:rescheduled',
      message: `📋 ${queuedVideos.length} videos rescheduled (interval=${publishIntervalMinutes}min)`,
    })

    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send(IPC_CHANNELS.CAMPAIGNS_UPDATED)
    })

    return { success: true, count: queuedVideos.length }
  })
}

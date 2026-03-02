/**
 * TikTok Repost — Workflow-specific IPC handlers
 *
 * Auto-loaded by src/workflows/index.ts via ipc.ts convention.
 * Register all IPC handlers that are specific to this workflow here.
 */
import { ipcMain, BrowserWindow, shell } from 'electron'
import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { normalizeTimeRanges, nextValidSlot } from '@nodes/_shared/timeWindow'
import { videoEditPluginRegistry } from '@core/video-edit'

export function setup() {
  // ── Video Edit Plugins (auto-loaded from registry) ────
  ipcMain.handle('video-edit:get-plugin-metas', () => {
    return videoEditPluginRegistry.getPluginMetas()
  })

  ipcMain.handle('video-edit:get-defaults', () => {
    return videoEditPluginRegistry.getDefaults()
  })
  // ── Videos by campaign ────────────────────────────────
  ipcMain.handle('campaign:get-videos', async (_event, { id }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return []
    return store.videos.sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0))
  })

  // ── Alerts by campaign ────────────────────────────────
  ipcMain.handle('campaign:get-alerts', async (_event, { id, limit }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return []
    const alerts = store.alerts.sort((a, b) => b.created_at - a.created_at)
    return limit ? alerts.slice(0, limit) : alerts
  })

  // ── Reschedule a single video ─────────────────────────
  ipcMain.handle('video:reschedule', async (_event, { platformId, campaignId, scheduledFor }) => {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return { success: false }
    store.updateVideo(platformId, { scheduled_for: scheduledFor })
    store.save()
    return { success: true }
  })

  // ── Show video file in system explorer ────────────────
  ipcMain.handle('video:show-in-explorer', async (_event, payload) => {
    const filePath = typeof payload === 'string' ? payload : payload?.path
    if (filePath) shell.showItemInFolder(filePath)
  })

  // ── Reschedule ALL queued videos with new params ──────
  ipcMain.handle('campaign:reschedule-all', async (_event, { id }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return { success: false, error: 'Campaign not found' }

    const params = store.params
    const intervalMinutes = params.intervalMinutes ?? 60
    const intervalMs = intervalMinutes * 60 * 1000
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
      node_id: 'core.video_scheduler',
      level: 'info',
      event: 'videos:rescheduled',
      message: `📋 ${queuedVideos.length} videos rescheduled (interval=${intervalMinutes}min)`,
    })

    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('campaigns-updated')
    })

    return { success: true, count: queuedVideos.length }
  })
}

import { ipcMain, dialog, net, shell } from 'electron'
import path from 'node:path'
import { AppSettingsService, AutomationBrowserSettings } from '../services/AppSettingsService'
import { BrowserProfileScannerService } from '../services/BrowserProfileScannerService'
import { browserService } from '../services/BrowserService'
import { cleanDbSchema, getDbPath, inspectDbSchema } from '../db/Database'
import { SentryOAuthService } from '../services/SentryOAuthService'
import { getFreeDiskSpaceMB } from '../utils/diskSpace'
import { flowLoader } from '@core/flow/FlowLoader'

export function setupSettingsIPC() {
  ipcMain.handle('browser:scan-local', async () => {
    return BrowserProfileScannerService.scanLocalBrowsers()
  })

  ipcMain.handle('settings:get-automation-browser', async () => {
    return AppSettingsService.getAutomationBrowserSettings()
  })

  ipcMain.handle('settings:set-automation-browser', async (_event, payload: AutomationBrowserSettings) => {
    AppSettingsService.setAutomationBrowserSettings(payload || {})
    await browserService.close().catch(() => {})
    return { success: true }
  })

  // ── Media Storage ───────────────────────────────────

  ipcMain.handle('settings:get-media-path', async () => {
    return {
      path: AppSettingsService.getMediaStoragePath(),
      defaultPath: AppSettingsService.getDefaultStoragePath(),
    }
  })

  ipcMain.handle('settings:set-media-path', async (_event, { path: dirPath }) => {
    AppSettingsService.setMediaStoragePath(dirPath)
    return { success: true }
  })

  ipcMain.handle('settings:browse-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Media Storage Folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: AppSettingsService.getMediaStoragePath(),
    })
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('settings:db-info', async () => {
    return { dbPath: getDbPath() }
  })

  ipcMain.handle('settings:clean-schema', async () => {
    await browserService.close().catch(() => {})
    return cleanDbSchema()
  })

  ipcMain.handle('settings:inspect-schema', async () => {
    return inspectDbSchema()
  })

  ipcMain.handle('settings:sentry-oauth-status', async () => {
    return SentryOAuthService.getStatus()
  })

  ipcMain.handle('settings:sentry-oauth-start', async () => {
    const started = await SentryOAuthService.startDeviceAuthorization()
    const verifyUrl = started.pending?.verificationUriComplete || started.pending?.verificationUri
    if (verifyUrl) {
      await shell.openExternal(verifyUrl).catch(() => {})
    }
    return started
  })

  ipcMain.handle('settings:sentry-oauth-poll', async (_event, payload?: { sessionId?: string }) => {
    return SentryOAuthService.pollDeviceAuthorization({ sessionId: payload?.sessionId })
  })

  ipcMain.handle(
    'settings:sentry-oauth-select-projects',
    async (_event, payload?: { productionProjectSlug?: string; stagingProjectSlug?: string }) => {
      return SentryOAuthService.saveProjectSelection({
        productionProjectSlug: payload?.productionProjectSlug,
        stagingProjectSlug: payload?.stagingProjectSlug,
      })
    }
  )

  ipcMain.handle('settings:sentry-oauth-disconnect', async () => {
    return SentryOAuthService.disconnect()
  })

  // ── Health Check endpoints for splash screen ──────────

  ipcMain.handle('healthcheck:network', async () => {
    const start = Date.now()
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      await net.fetch('https://www.tiktok.com', {
        method: 'HEAD',
        signal: controller.signal as any,
      })
      clearTimeout(timeout)
      return { ok: true, ms: Date.now() - start }
    } catch (err: any) {
      return { ok: false, ms: Date.now() - start, error: err?.message || 'Network unreachable' }
    }
  })

  ipcMain.handle('healthcheck:storage', async () => {
    const mediaPath = AppSettingsService.getMediaStoragePath()
    try {
      const freeMB = await getFreeDiskSpaceMB(mediaPath)
      const drive = path.parse(mediaPath).root
      return { ok: freeMB > 100, freeMB, freeBytes: freeMB * 1024 * 1024, path: mediaPath, drive }
    } catch (err: any) {
      return { ok: false, freeMB: -1, freeBytes: -1, path: mediaPath, error: err?.message || 'Failed to check storage' }
    }
  })

  ipcMain.handle('shell:open-path', async (_event, { path: targetPath }) => {
    await shell.openPath(targetPath)
    return { ok: true }
  })

  // ── Workflow-aware service health checks ──────────
  ipcMain.handle('healthcheck:services', async () => {
    const flows = flowLoader.getAll()

    // Collect unique service URLs from all workflow definitions
    const serviceMap = new Map<string, { name: string; url: string; workflows: string[] }>()
    for (const flow of flows) {
      for (const hc of flow.health_checks || []) {
        const existing = serviceMap.get(hc.url)
        if (existing) {
          if (!existing.workflows.includes(flow.name)) existing.workflows.push(flow.name)
        } else {
          serviceMap.set(hc.url, { name: hc.name, url: hc.url, workflows: [flow.name] })
        }
      }
    }

    // Test each unique service
    const results = await Promise.all(
      [...serviceMap.values()].map(service => pingServiceEndpoint(service))
    )

    return { services: results, totalWorkflows: flows.length }
  })
}

async function pingServiceEndpoint(service: { name: string; url: string; workflows: string[] }) {
  const { net } = require('electron')
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await net.fetch(service.url, { method: 'HEAD', signal: controller.signal as any })
    clearTimeout(timeout)
    return { ...service, ok: true, ms: Date.now() - start }
  } catch (err: any) {
    return { ...service, ok: false, ms: Date.now() - start, error: err?.message || 'Unreachable' }
  }
}

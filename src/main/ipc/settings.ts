import { ipcMain, dialog } from 'electron'
import { AppSettingsService, AutomationBrowserSettings } from '../services/AppSettingsService'
import { BrowserProfileScannerService } from '../services/BrowserProfileScannerService'
import { browserService } from '../services/BrowserService'

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
}

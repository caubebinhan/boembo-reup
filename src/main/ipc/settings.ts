import { ipcMain } from 'electron'
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
    // Force next publish/test run to use the latest config.
    await browserService.close().catch(() => {})
    return { success: true }
  })
}

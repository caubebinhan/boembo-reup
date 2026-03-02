import { ipcMain, BrowserWindow } from 'electron'
import { PublishAccountService } from '../services/PublishAccountService'
import { videoEditPluginRegistry } from '../../core/video-edit/VideoEditPluginRegistry'

export function setupWizardIPC() {
  // Guard against HMR double-registration in dev mode
  const safeHandle = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }

  // Video edit plugin metadata for Step3 wizard
  safeHandle('video-edit:get-plugin-metas', async () => {
    try {
      const metas = videoEditPluginRegistry.getPluginMetas()
      console.log(`[IPC] video-edit:get-plugin-metas → ${metas.length} plugins`)
      return metas
    } catch (err) {
      console.error('[IPC] video-edit:get-plugin-metas error:', err)
      return []
    }
  })

  // Account management
  safeHandle('account:list', async () => {
    try {
      const accounts = PublishAccountService.listAccounts()
      console.log(`[IPC] account:list → ${accounts.length} accounts`)
      return accounts.map(a => ({
        id: a.id,
        username: a.username,
        handle: a.handle || `@${a.username}`,
        avatar: a.avatar,
        status: a.session_status,
      }))
    } catch (err) {
      console.error('[IPC] account:list error:', err)
      return []
    }
  })

  safeHandle('account:add', async () => {
    console.log('[IPC] account:add — opening login window')
    const parentWindow = BrowserWindow.getFocusedWindow() || undefined
    const account = await PublishAccountService.addAccountViaLogin(parentWindow)
    if (account) {
      console.log(`[IPC] account:add — saved: ${account.username}`)
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('account:updated')
      })
    }
    return account ? { id: account.id, username: account.username, handle: account.handle, status: 'active' } : null
  })

  safeHandle('account:delete', async (_event, { id }: { id: string }) => {
    console.log(`[IPC] account:delete — ${id}`)
    PublishAccountService.deleteAccount(id)
    return true
  })

}

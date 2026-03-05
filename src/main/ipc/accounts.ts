import { ipcMain, BrowserWindow } from 'electron'
import { PublishAccountService } from '../services/PublishAccountService'
import { IPC_CHANNELS } from '@shared/ipc-types'

export function setupAccountsIPC() {
  const safeHandle = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }

  safeHandle(IPC_CHANNELS.ACCOUNT_LIST, async () => {
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

  safeHandle(IPC_CHANNELS.ACCOUNT_ADD, async () => {
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

  safeHandle(IPC_CHANNELS.ACCOUNT_DELETE, async (_event, { id }: { id: string }) => {
    console.log(`[IPC] account:delete — ${id}`)
    PublishAccountService.deleteAccount(id)
    return true
  })
}

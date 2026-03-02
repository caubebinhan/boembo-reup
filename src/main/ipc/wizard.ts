import { ipcMain, BrowserWindow, dialog } from 'electron'
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

  // File picker dialog for video editor
  safeHandle('dialog:open-file', async (_event, opts?: { filters?: { name: string; extensions: string[] }[] }) => {
    const parentWindow = BrowserWindow.getFocusedWindow() || undefined
    const result = await dialog.showOpenDialog(parentWindow!, {
      properties: ['openFile'],
      filters: opts?.filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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

  // ── Video Editor Window ─────────────────────────────
  let _editorParentWin: BrowserWindow | null = null

  safeHandle('video-editor:open', async (event, payload?: { data?: any }) => {
    const { join } = require('node:path')
    const { is } = require('@electron-toolkit/utils')
    const parentWin = BrowserWindow.fromWebContents(event.sender)
    _editorParentWin = parentWin

    const editorWin = new BrowserWindow({
      parent: parentWin || undefined,
      width: 1400,
      height: 900,
      title: 'BOEMBO - Video Editor',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: false, // Allow file:// video URLs
      }
    })

    editorWin.on('closed', () => {
      _editorParentWin = null
    })

    // Once the editor window loads, send initial data
    editorWin.webContents.on('did-finish-load', () => {
      editorWin.webContents.send('video-editor:init-data', payload?.data || {})
    })

    // Load the same renderer URL with #/video-editor hash route
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await editorWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/video-editor`)
    } else {
      await editorWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/video-editor' })
    }
  })

  // Editor window calls this when user clicks "Done Editing"
  safeHandle('video-editor:done', async (event, result: any) => {
    // Forward result to parent window (the wizard)
    if (_editorParentWin && !_editorParentWin.isDestroyed()) {
      _editorParentWin.webContents.send('video-editor:done', result)
    }
    // Close the editor window
    const editorWin = BrowserWindow.fromWebContents(event.sender)
    if (editorWin && !editorWin.isDestroyed()) {
      editorWin.close()
    }
    _editorParentWin = null
    return { ok: true }
  })

  // Preview: run FFmpeg pipeline and return rendered output path
  safeHandle('video-edit:preview', async (_event, payload: { videoPath: string; operations: any[] }) => {
    const { executeVideoEditPipeline } = await import('@core/video-edit')
    const result = await executeVideoEditPipeline({
      inputPath: payload.videoPath,
      operations: payload.operations,
      onProgress: (msg) => console.log('[VideoEdit:Preview]', msg),
    })
    return { outputPath: result.outputPath, wasModified: result.wasModified }
  })

}

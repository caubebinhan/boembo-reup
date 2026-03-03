import { ipcMain, BrowserWindow, dialog } from 'electron'
import { videoEditPluginRegistry } from '../../core/video-edit/VideoEditPluginRegistry'
import { IPC_CHANNELS } from '@shared/ipc-types'

export function setupVideoEditorIPC() {
  const safeHandle = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }

  // Video edit plugin metadata
  safeHandle(IPC_CHANNELS.VIDEO_EDIT_GET_PLUGIN_METAS, async () => {
    try {
      const metas = videoEditPluginRegistry.getPluginMetas()
      console.log(`[IPC] video-edit:get-plugin-metas -> ${metas.length} plugins`)
      return metas
    } catch (err) {
      console.error('[IPC] video-edit:get-plugin-metas error:', err)
      return []
    }
  })

  // Video edit default config (which plugins are enabled by default)
  safeHandle(IPC_CHANNELS.VIDEO_EDIT_GET_DEFAULTS, async () => {
    try {
      return videoEditPluginRegistry.getDefaults()
    } catch (err) {
      console.error('[IPC] video-edit:get-defaults error:', err)
      return {}
    }
  })

  // File picker dialog for video editor
  safeHandle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (_event, opts?: { filters?: { name: string; extensions: string[] }[] }) => {
    const parentWindow = BrowserWindow.getFocusedWindow() || undefined
    const result = await dialog.showOpenDialog(parentWindow!, {
      properties: ['openFile'],
      filters: opts?.filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── Video Editor Window ─────────────────────────────
  let _editorParentWin: BrowserWindow | null = null

  safeHandle(IPC_CHANNELS.VIDEO_EDITOR_OPEN, async (event, payload?: { data?: any }) => {
    const { join } = require('node:path')
    const { is } = require('@electron-toolkit/utils')
    const parentWin = BrowserWindow.fromWebContents(event.sender)
    _editorParentWin = parentWin

    const editorWin = new BrowserWindow({
      parent: parentWin || undefined,
      width: 1000,
      height: 700,
      title: 'BOEMBO - Video Editor',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: false, // Allow file:// video URLs
      }
    })

    editorWin.on('closed', () => {
      if (_editorParentWin && !_editorParentWin.isDestroyed()) {
        // Keep wizard state in sync when user closes editor with window controls.
        _editorParentWin.webContents.send(IPC_CHANNELS.VIDEO_EDITOR_DONE, null)
      }
      _editorParentWin = null
    })

    editorWin.webContents.on('did-finish-load', () => {
      editorWin.webContents.send(IPC_CHANNELS.VIDEO_EDITOR_INIT_DATA, payload?.data || {})
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await editorWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/video-editor`)
    } else {
      await editorWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/video-editor' })
    }
  })

  // Editor window calls this when user clicks "Done Editing"
  safeHandle(IPC_CHANNELS.VIDEO_EDITOR_DONE, async (event, result: any) => {
    if (_editorParentWin && !_editorParentWin.isDestroyed()) {
      _editorParentWin.webContents.send(IPC_CHANNELS.VIDEO_EDITOR_DONE, result)
    }
    const editorWin = BrowserWindow.fromWebContents(event.sender)
    if (editorWin && !editorWin.isDestroyed()) {
      editorWin.close()
    }
    _editorParentWin = null
    return { ok: true }
  })

  // Preview: run FFmpeg pipeline and return rendered output path
  safeHandle(IPC_CHANNELS.VIDEO_EDIT_PREVIEW, async (
    event,
    payload: { videoPath: string; operations: any[]; requestId?: string; timeoutMs?: number },
  ) => {
    const requestId = payload?.requestId || `preview_${Date.now().toString(36)}`
    const trace: Array<{ ts: number; level: 'info' | 'error'; stage: string; message: string }> = []

    const emit = (level: 'info' | 'error', message: string, stage = 'runtime') => {
      const row = { ts: Date.now(), level, stage, message }
      trace.push(row)
      event.sender.send(IPC_CHANNELS.VIDEO_EDIT_PREVIEW_PROGRESS, { ...row, requestId })
      if (level === 'error') console.error(`[VideoEdit:Preview:${requestId}] ${message}`)
      else console.log(`[VideoEdit:Preview:${requestId}] ${message}`)
    }

    try {
      emit('info', 'Preparing preview render...', 'start')
      const { executeVideoEditPipeline } = await import('@core/video-edit')
      const { ffmpegProcessor } = await import('@main/ffmpeg/FFmpegAdapter')
      const result = await executeVideoEditPipeline({
        inputPath: payload.videoPath,
        processor: ffmpegProcessor,
        operations: payload.operations,
        timeoutMs: payload?.timeoutMs || 180_000,
        onProgress: (msg) => emit('info', msg, 'pipeline'),
      })
      emit('info', `Preview done (${result.totalDurationMs}ms)`)
      return {
        outputPath: result.outputPath,
        wasModified: result.wasModified,
        requestId,
        trace,
      }
    } catch (err: any) {
      const message = err?.message || String(err)
      emit('error', `Pipeline failed: ${message}`, 'error')
      return { error: message, outputPath: null, wasModified: false, requestId, trace }
    }
  })
}

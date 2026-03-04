import { ipcMain, BrowserWindow, dialog } from 'electron'
import { videoEditPluginRegistry } from '../../core/video-edit/VideoEditPluginRegistry'
import { IPC_CHANNELS } from '@shared/ipc-types'
import { pathToFileURL } from 'node:url'

export function setupVideoEditorIPC() {
  const safeHandle = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }

  const safeSendToWindow = (win: BrowserWindow | null, channel: string, payload: unknown) => {
    try {
      if (!win || win.isDestroyed()) return
      const wc = win.webContents
      if (!wc || wc.isDestroyed()) return
      wc.send(channel, payload)
    } catch {
      // Window may already be closed while async work is finishing.
    }
  }

  const normalizePreviewMessage = (raw: string): string => {
    return String(raw || '')
      .replace(/ﾂｷ/g, '|')
      .replace(/[•·]/g, '|')
      .replace(/\s+\|\s+/g, ' | ')
      .replace(/\s{2,}/g, ' ')
      .trim()
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
  const _intentionalCloseSet = new Set<number>() // webContents IDs for editors that clicked "Done"
  const _editorInitDataByContentsId = new Map<number, any>()
  let _previewPlayerWin: BrowserWindow | null = null

  const openPreviewPlayerWindow = async (outputPath: string): Promise<boolean> => {
    const safePath = String(outputPath || '').trim()
    if (!safePath) return false

    const src = pathToFileURL(safePath).toString()

    if (_previewPlayerWin && !_previewPlayerWin.isDestroyed()) {
      _previewPlayerWin.close()
      _previewPlayerWin = null
    }

    const previewWin = new BrowserWindow({
      width: 960,
      height: 640,
      minWidth: 640,
      minHeight: 420,
      title: 'BOEMBO - Preview Player',
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    _previewPlayerWin = previewWin
    previewWin.on('closed', () => {
      if (_previewPlayerWin === previewWin) _previewPlayerWin = null
    })
    await previewWin.loadURL(src)
    return true
  }

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
    _editorInitDataByContentsId.set(editorWin.webContents.id, payload?.data || {})

    // Fix 7: Warn user about unsaved changes when closing via window controls
    editorWin.on('close', (e) => {
      // Skip dialog if this close was triggered by Done button
      if (_intentionalCloseSet.has(editorWin.webContents.id)) {
        _intentionalCloseSet.delete(editorWin.webContents.id)
        return
      }
      const choice = dialog.showMessageBoxSync(editorWin, {
        type: 'question',
        buttons: ['Discard changes', 'Cancel'],
        defaultId: 1,
        title: 'Unsaved changes',
        message: 'You have unsaved video editor changes. Discard and close?',
      })
      if (choice === 1) {
        e.preventDefault()
        return
      }
    })

    editorWin.on('closed', () => {
      _intentionalCloseSet.delete(editorWin.webContents.id)
      _editorInitDataByContentsId.delete(editorWin.webContents.id)
      // Keep wizard state in sync when user closes editor with window controls.
      safeSendToWindow(_editorParentWin, IPC_CHANNELS.VIDEO_EDITOR_DONE, null)
      _editorParentWin = null
    })

    editorWin.webContents.on('did-finish-load', () => {
      editorWin.webContents.send(
        IPC_CHANNELS.VIDEO_EDITOR_INIT_DATA,
        _editorInitDataByContentsId.get(editorWin.webContents.id) || {},
      )
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await editorWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/video-editor`)
    } else {
      await editorWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/video-editor' })
    }
  })

  safeHandle(IPC_CHANNELS.VIDEO_EDITOR_GET_INIT_DATA, async (event) => {
    return _editorInitDataByContentsId.get(event.sender.id) || {}
  })

  // Editor window calls this when user clicks "Done Editing"
  safeHandle(IPC_CHANNELS.VIDEO_EDITOR_DONE, async (event, result: any) => {
    safeSendToWindow(_editorParentWin, IPC_CHANNELS.VIDEO_EDITOR_DONE, result)
    const editorWin = BrowserWindow.fromWebContents(event.sender)
    if (editorWin && !editorWin.isDestroyed()) {
      _intentionalCloseSet.add(event.sender.id) // skip unsaved-changes dialog
      editorWin.close()
    }
    _editorParentWin = null
    return { ok: true }
  })

  // Preview: run FFmpeg pipeline and return rendered output path
  safeHandle(IPC_CHANNELS.VIDEO_EDIT_PREVIEW, async (
    event,
    payload: { videoPath: string; operations: any[]; requestId?: string; timeoutMs?: number; openPlayerWindow?: boolean },
  ) => {
    const sender = event.sender
    const requestId = payload?.requestId || `preview_${Date.now().toString(36)}`
    const startedAt = Date.now()
    const trace: Array<{ ts: number; level: 'info' | 'error'; stage: string; message: string }> = []

    const safeSendProgress = (row: { ts: number; level: 'info' | 'error'; stage: string; message: string }) => {
      try {
        if (!sender) return
        if (typeof (sender as any).isDestroyed === 'function' && (sender as any).isDestroyed()) return
        sender.send(IPC_CHANNELS.VIDEO_EDIT_PREVIEW_PROGRESS, { ...row, requestId })
      } catch {
        // Renderer may close while preview is still rendering; keep pipeline alive.
      }
    }

    const emit = (level: 'info' | 'error', message: string, stage = 'runtime') => {
      const row = { ts: Date.now(), level, stage, message }
      trace.push(row)
      safeSendProgress(row)
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
        onProgress: (msg) => emit('info', normalizePreviewMessage(msg), 'pipeline'),
      })
      let previewOutputPath = result.outputPath
      try {
        const { mkdir, copyFile, rm } = await import('node:fs/promises')
        const { extname, join } = await import('node:path')
        const { tmpdir } = await import('node:os')
        const previewDir = join(tmpdir(), 'boembo-video-preview')
        await mkdir(previewDir, { recursive: true })
        const ext = extname(result.outputPath || payload.videoPath) || '.mp4'
        const tempPath = join(previewDir, `${requestId}${ext}`)
        await copyFile(result.outputPath, tempPath)
        previewOutputPath = tempPath

        if (result.wasModified && result.outputPath && result.outputPath !== payload.videoPath) {
          rm(result.outputPath, { force: true }).catch(() => {})
        }
        emit('info', `Preview temp file ready: ${tempPath}`, 'preview')
      } catch (copyErr: any) {
        emit('info', `Preview temp copy skipped: ${copyErr?.message || 'copy failed'}`, 'preview')
      }

      let playerOpened = false
      if (payload?.openPlayerWindow !== false && previewOutputPath) {
        try {
          playerOpened = await openPreviewPlayerWindow(previewOutputPath)
          if (playerOpened) emit('info', 'Preview player opened.', 'preview-player')
        } catch (openErr: any) {
          emit('error', `Failed to open preview player: ${openErr?.message || openErr}`, 'preview-player')
        }
      }

      const renderDurationMs = Math.max(0, Date.now() - startedAt)
      emit('info', `Preview render completed in ${renderDurationMs}ms.`, 'done')
      return {
        outputPath: previewOutputPath,
        wasModified: result.wasModified,
        playerOpened,
        renderDurationMs,
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

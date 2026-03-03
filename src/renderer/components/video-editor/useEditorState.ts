/**
 * useEditorState — Custom hook for Video Editor state management
 * ──────────────────────────────────────────────────────────────
 * Extracts ALL state + handlers from VideoEditorWindow into a testable hook.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { PluginMeta, VideoEditOperation } from './types'
import { IPC_CHANNELS } from '@shared/ipc-types'

interface UseEditorStateReturn {
  // State
  videoSrc: string | null
  videoPath: string | null
  plugins: PluginMeta[]
  operations: VideoEditOperation[]
  selectedOpId: string | null
  currentTime: number
  previewSrc: string | null
  previewError: string | null
  previewStatus: string | null
  isRendering: boolean
  traceLogs: Array<{ ts: number; level: 'info' | 'warn' | 'error'; message: string }>

  // Actions
  handleUploadVideo: () => Promise<void>
  handleAddOperation: (pluginId: string) => void
  handleRemoveOperation: (opId: string) => void
  handleUpdateParams: (opId: string, params: Record<string, any>) => void
  handleToggleEnabled: (opId: string) => void
  handleSelectOperation: (opId: string) => void
  handleSeek: (time: number) => void
  handlePreview: () => Promise<void>
  handleDone: () => void

  // Derived
  selectedOperation: VideoEditOperation | null
  selectedPlugin: PluginMeta | null
}

export function useEditorState(): UseEditorStateReturn {
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [plugins, setPlugins] = useState<PluginMeta[]>([])
  const [operations, setOperations] = useState<VideoEditOperation[]>([])
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [traceLogs, setTraceLogs] = useState<Array<{ ts: number; level: 'info' | 'warn' | 'error'; message: string }>>([])
  const activePreviewRequestIdRef = useRef<string | null>(null)
  const lastParamTraceAtRef = useRef(0)

  const pushTrace = useCallback((message: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const row = { ts: Date.now(), level, message }
    setTraceLogs(prev => [...prev.slice(-299), row])
    if (level === 'error') console.error('[VideoEditor:Trace]', message)
    else console.log('[VideoEditor:Trace]', message)
  }, [])

  // Load plugins and defaults from main process
  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    api.invoke?.(IPC_CHANNELS.VIDEO_EDIT_GET_PLUGIN_METAS).then((metas: PluginMeta[]) => {
      setPlugins(metas)
      pushTrace(`Loaded ${metas?.length || 0} plugin metadata entries.`)
    }).catch(() => {})

    api.invoke?.(IPC_CHANNELS.VIDEO_EDIT_GET_DEFAULTS).then((ops: VideoEditOperation[]) => {
      if (ops?.length) {
        setOperations(ops)
        pushTrace(`Initialized ${ops.length} default operations.`)
      }
    }).catch(() => {})
  }, [pushTrace])

  // Receive init data from parent window (restores previously-saved state)
  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    const off = api.on?.(IPC_CHANNELS.VIDEO_EDITOR_INIT_DATA, (initData: any) => {
      if (!initData) return
      if (initData.videoEditOperations?.length) {
        setOperations(initData.videoEditOperations)
        pushTrace(`Restored ${initData.videoEditOperations.length} operation(s) from wizard state.`)
      }
      if (initData._previewVideoSrc) {
        setPreviewSrc(initData._previewVideoSrc)
        pushTrace('Restored previous preview source.')
      }
    })
    return () => { if (typeof off === 'function') off() }
  }, [pushTrace])

  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    const off = api.on?.(IPC_CHANNELS.VIDEO_EDIT_PREVIEW_PROGRESS, (evt: any) => {
      const activeId = activePreviewRequestIdRef.current
      if (!activeId) return
      if (!evt || evt.requestId !== activeId) return
      const message = String(evt.message || '').trim()
      if (!message) return
      setPreviewStatus(message)
      pushTrace(`[${evt.stage || 'pipeline'}] ${message}`, evt.level === 'error' ? 'error' : 'info')
    })
    return () => { if (typeof off === 'function') off() }
  }, [pushTrace])

  // Upload video file
  const handleUploadVideo = useCallback(async () => {
    const api = (window as any).api
    if (!api) return
    try {
      const path = await api.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, {
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }],
      })
      if (path) {
        setVideoPath(path)
        setVideoSrc(`file://${path}`)
        setPreviewSrc(null)
        setPreviewError(null)
        pushTrace(`Selected source video: ${path}`)
      }
    } catch {
      pushTrace('Failed to open file picker for source video.', 'warn')
    }
  }, [pushTrace])

  // Add operation
  const handleAddOperation = useCallback((pluginId: string) => {
    const plugin = plugins.find(p => p.id === pluginId)
    if (!plugin) return

    const defaultParams: Record<string, any> = {}
    plugin.configSchema.forEach(f => {
      if (f.default !== undefined) defaultParams[f.key] = f.default
    })

    const newOp: VideoEditOperation = {
      id: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      pluginId,
      enabled: true,
      params: defaultParams,
      order: operations.length,
    }

    setOperations(prev => [...prev, newOp])
    setSelectedOpId(newOp.id)
    pushTrace(`Added operation: ${plugin.name}`)
  }, [plugins, operations.length, pushTrace])

  // Remove operation
  const handleRemoveOperation = useCallback((opId: string) => {
    setOperations(prev => prev.filter(o => o.id !== opId))
    if (selectedOpId === opId) setSelectedOpId(null)
    pushTrace(`Removed operation: ${opId}`)
  }, [selectedOpId, pushTrace])

  // Update params
  const handleUpdateParams = useCallback((opId: string, params: Record<string, any>) => {
    setOperations(prev => prev.map(o => o.id === opId ? { ...o, params } : o))
    const now = Date.now()
    if (now - lastParamTraceAtRef.current > 250) {
      pushTrace(`Updated params via canvas/panel: ${opId}`)
      lastParamTraceAtRef.current = now
    }
  }, [pushTrace])

  // Toggle enabled
  const handleToggleEnabled = useCallback((opId: string) => {
    setOperations(prev => prev.map(o => o.id === opId ? { ...o, enabled: !o.enabled } : o))
    pushTrace(`Toggled operation enabled state: ${opId}`)
  }, [pushTrace])

  // Select operation
  const handleSelectOperation = useCallback((opId: string) => {
    setSelectedOpId(opId)
  }, [])

  // Seek
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  // Preview — run FFmpeg render
  const handlePreview = useCallback(async () => {
    const api = (window as any).api
    if (!api || !videoPath || isRendering) return

    const requestId = `preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const timeoutMs = 190_000
    activePreviewRequestIdRef.current = requestId

    setIsRendering(true)
    setPreviewError(null)
    setPreviewStatus('Queued...')
    pushTrace(`Preview requested (${requestId}).`)
    try {
      const invokePromise = api.invoke(IPC_CHANNELS.VIDEO_EDIT_PREVIEW, {
        requestId,
        timeoutMs: 180_000,
        videoPath,
        operations: operations.filter(o => o.enabled),
      })
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Preview timeout after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
      })
      const result: any = await Promise.race([invokePromise, timeoutPromise])

      if (Array.isArray(result?.trace)) {
        for (const row of result.trace) {
          const msg = row?.message ? String(row.message) : ''
          if (!msg) continue
          pushTrace(`[${row?.stage || 'pipeline'}] ${msg}`, row?.level === 'error' ? 'error' : 'info')
        }
      }
      if (result?.error) {
        setPreviewError(String(result.error))
        pushTrace(`Preview failed: ${String(result.error)}`, 'error')
        return
      }
      if (result?.outputPath) {
        setPreviewSrc(`file://${result.outputPath}?t=${Date.now()}`)
        pushTrace(`Preview output generated: ${result.outputPath}`)
        return
      }
      setPreviewError('Preview render failed. Please check your operation parameters.')
      pushTrace('Preview returned without output path.', 'error')
    } catch (err: any) {
      console.error('[VideoEditor] Preview failed:', err)
      setPreviewError(err?.message || 'Preview render failed. Please try again.')
      pushTrace(`Preview exception: ${err?.message || 'Unknown error'}`, 'error')
    } finally {
      setIsRendering(false)
      setPreviewStatus(null)
      activePreviewRequestIdRef.current = null
    }
  }, [videoPath, operations, isRendering, pushTrace])

  // Done — close editor window, send data in the shape WizardVideoEdit expects
  const handleDone = useCallback(() => {
    const api = (window as any).api
    const enabledPluginIds = Array.from(
      new Set(operations.filter(op => op.enabled).map(op => op.pluginId)),
    )
    api?.invoke?.(IPC_CHANNELS.VIDEO_EDITOR_DONE, {
      videoEditOperations: operations,
      _enabledPluginIds: enabledPluginIds,
      _previewVideoSrc: previewSrc,
    })
    pushTrace('Done clicked. Sending editor result back to wizard.')
  }, [operations, previewSrc, pushTrace])

  // Derived
  const selectedOperation = useMemo(
    () => operations.find(o => o.id === selectedOpId) || null,
    [operations, selectedOpId],
  )

  const selectedPlugin = useMemo(
    () => selectedOperation ? plugins.find(p => p.id === selectedOperation.pluginId) || null : null,
    [selectedOperation, plugins],
  )

  return {
    videoSrc, videoPath, plugins, operations, selectedOpId,
    currentTime, previewSrc, previewError, previewStatus, isRendering, traceLogs,
    handleUploadVideo, handleAddOperation, handleRemoveOperation,
    handleUpdateParams, handleToggleEnabled, handleSelectOperation,
    handleSeek, handlePreview, handleDone,
    selectedOperation, selectedPlugin,
  }
}

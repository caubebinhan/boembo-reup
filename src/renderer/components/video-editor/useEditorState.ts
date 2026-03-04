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
  renderProgress: number | null
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
  setVideoDuration: (sec: number) => void

  // Derived
  selectedOperation: VideoEditOperation | null
  selectedPlugin: PluginMeta | null
}

function toFileSrc(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return ''
  if (/^(file|https?|data):/i.test(raw)) return raw

  const normalized = raw.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${normalized}`
  if (normalized.startsWith('/')) return `file://${normalized}`
  return `file://${normalized}`
}

function hasInitPayloadShape(initData: any): boolean {
  if (!initData || typeof initData !== 'object') return false
  return (
    Object.prototype.hasOwnProperty.call(initData, 'videoEditOperations')
    || Object.prototype.hasOwnProperty.call(initData, '_videoPath')
    || Object.prototype.hasOwnProperty.call(initData, '_previewVideoSrc')
    || Object.prototype.hasOwnProperty.call(initData, '_enabledPluginIds')
  )
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
  const [renderProgress, setRenderProgress] = useState<number | null>(null)
  const videoDurationRef = useRef<number>(0)
  const [traceLogs, setTraceLogs] = useState<Array<{ ts: number; level: 'info' | 'warn' | 'error'; message: string }>>([])
  const activePreviewRequestIdRef = useRef<string | null>(null)
  const lastParamTraceAtRef = useRef(0)
  const hasAppliedInitPayloadRef = useRef(false)

  const pushTrace = useCallback((message: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const row = { ts: Date.now(), level, message }
    setTraceLogs(prev => [...prev.slice(-299), row])
    if (level === 'error') console.error('[VideoEditor:Trace]', message)
    else console.log('[VideoEditor:Trace]', message)
  }, [])

  const applyInitData = useCallback((initData: any, source: 'event' | 'pull'): void => {
    if (!hasInitPayloadShape(initData)) return
    if (hasAppliedInitPayloadRef.current) return
    hasAppliedInitPayloadRef.current = true

    if (Object.prototype.hasOwnProperty.call(initData, 'videoEditOperations')) {
      const restoredOps = Array.isArray(initData.videoEditOperations)
        ? (initData.videoEditOperations as VideoEditOperation[])
        : []
      setOperations(restoredOps)
      setSelectedOpId(restoredOps[0]?.id || null)
      pushTrace(`Restored ${restoredOps.length} operation(s) from wizard state (${source}).`)
    }

    if (Object.prototype.hasOwnProperty.call(initData, '_videoPath')) {
      const restoredPath = typeof initData._videoPath === 'string'
        ? initData._videoPath.trim()
        : ''
      if (restoredPath) {
        setVideoPath(restoredPath)
        setVideoSrc(toFileSrc(restoredPath))
        pushTrace(`Restored source video path: ${restoredPath}`)
      } else {
        setVideoPath(null)
        setVideoSrc(null)
      }
    }

    if (Object.prototype.hasOwnProperty.call(initData, '_previewVideoSrc')) {
      const restoredPreview = typeof initData._previewVideoSrc === 'string'
        ? initData._previewVideoSrc.trim()
        : ''
      setPreviewSrc(restoredPreview || null)
      if (restoredPreview) pushTrace('Restored previous preview source.')
    }
  }, [pushTrace])

  // Load plugins and defaults from main process
  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    api.invoke?.(IPC_CHANNELS.VIDEO_EDIT_GET_PLUGIN_METAS).then((metas: PluginMeta[]) => {
      setPlugins(metas)
      pushTrace(`Loaded ${metas?.length || 0} plugin metadata entries.`)
    }).catch(() => {})

    api.invoke?.(IPC_CHANNELS.VIDEO_EDIT_GET_DEFAULTS).then((ops: VideoEditOperation[]) => {
      if (ops?.length && !hasAppliedInitPayloadRef.current) {
        setOperations(ops)
        setSelectedOpId(prev => prev || ops[0]?.id || null)
        pushTrace(`Initialized ${ops.length} default operations.`)
      }
    }).catch(() => {})
  }, [pushTrace])

  // Receive init data from parent window (restores previously-saved state)
  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    const off = api.on?.(IPC_CHANNELS.VIDEO_EDITOR_INIT_DATA, (initData: any) => {
      applyInitData(initData, 'event')
    })
    api.invoke?.(IPC_CHANNELS.VIDEO_EDITOR_GET_INIT_DATA)
      .then((initData: any) => applyInitData(initData, 'pull'))
      .catch(() => {})
    return () => { if (typeof off === 'function') off() }
  }, [applyInitData])

  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    const off = api.on?.(IPC_CHANNELS.VIDEO_EDIT_PREVIEW_PROGRESS, (evt: any) => {
      const activeId = activePreviewRequestIdRef.current
      if (!activeId) return
      if (!evt || evt.requestId !== activeId) return
      const message = String(evt.message || '').trim()
      if (!message) return
      // Parse FFmpeg time progress: "Rendering | t=00:01:23.45 | speed=..."
      const timeMatch = message.match(/t=(\d{2}):(\d{2}):(\d{2}\.\d+)/)
      if (timeMatch && videoDurationRef.current > 0) {
        const currentSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3])
        const pct = Math.min(99, Math.round((currentSec / videoDurationRef.current) * 100))
        setRenderProgress(pct)
        setPreviewStatus(`Rendering ${pct}%`)
      } else {
        setPreviewStatus(message)
      }
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
        setVideoSrc(toFileSrc(path))
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
  }, [plugins, operations, pushTrace])

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
    const timeoutMs = 900_000
    activePreviewRequestIdRef.current = requestId

    setIsRendering(true)
    setPreviewError(null)
    setRenderProgress(0)
    // Force preview panel to stay on source video until FFmpeg produces a complete file.
    setPreviewSrc(null)
    setPreviewStatus('Preparing render...')
    pushTrace(`Preview requested (${requestId}).`)
    try {
      const invokePromise = api.invoke(IPC_CHANNELS.VIDEO_EDIT_PREVIEW, {
        requestId,
        timeoutMs,
        videoPath,
        operations: operations.filter(o => o.enabled),
        openPlayerWindow: true,
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
        const src = toFileSrc(result.outputPath)
        if (!result?.playerOpened) {
          setPreviewSrc(`${src}?t=${Date.now()}`)
          pushTrace(`Preview output generated: ${result.outputPath}`)
          pushTrace('Preview player window did not open, falling back to in-editor preview.', 'warn')
        } else {
          setPreviewSrc(null)
          pushTrace(`Preview rendered and opened in player window: ${result.outputPath}`)
        }
        setPreviewStatus(result?.playerOpened ? 'Preview player opened.' : 'Preview render completed.')
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
      setRenderProgress(null)
      activePreviewRequestIdRef.current = null
    }
  }, [videoPath, operations, isRendering, pushTrace])

  // Done — close editor window, send data in the shape WizardVideoEdit expects
  // Uses api.send (fire-and-forget) instead of api.invoke to avoid 'object destroyed'
  // errors when the window closes before the IPC round-trip completes.
  const handleDone = useCallback(() => {
    const api = (window as any).api
    const enabledPluginIds = Array.from(
      new Set(operations.filter(op => op.enabled).map(op => op.pluginId)),
    )
    const payload = {
      videoEditOperations: operations,
      _enabledPluginIds: enabledPluginIds,
      _previewVideoSrc: previewSrc,
      _videoPath: videoPath,
    }
    // Fire-and-forget: the IPC handler will relay data to parent and close window
    if (api?.invoke) {
      api.invoke(IPC_CHANNELS.VIDEO_EDITOR_DONE, payload).catch(() => {})
    }
    pushTrace('Done clicked. Sending editor result back to wizard.')
  }, [operations, previewSrc, videoPath, pushTrace])

  // Derived
  const selectedOperation = useMemo(
    () => operations.find(o => o.id === selectedOpId) || null,
    [operations, selectedOpId],
  )

  const selectedPlugin = useMemo(
    () => selectedOperation ? plugins.find(p => p.id === selectedOperation.pluginId) || null : null,
    [selectedOperation, plugins],
  )

  const setVideoDuration = useCallback((sec: number) => {
    videoDurationRef.current = sec
  }, [])

  return {
    videoSrc, videoPath, plugins, operations, selectedOpId,
    currentTime, previewSrc, previewError, previewStatus, isRendering, renderProgress, traceLogs,
    handleUploadVideo, handleAddOperation, handleRemoveOperation,
    handleUpdateParams, handleToggleEnabled, handleSelectOperation,
    handleSeek, handlePreview, handleDone, setVideoDuration,
    selectedOperation, selectedPlugin,
  }
}

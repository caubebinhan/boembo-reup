/**
 * useEditorState — Custom hook for Video Editor state management
 * ──────────────────────────────────────────────────────────────
 * Extracts ALL state + handlers from VideoEditorWindow into a testable hook.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
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
  isRendering: boolean

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
  const [isRendering, setIsRendering] = useState(false)

  // Load plugins and defaults from main process
  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    api.invoke?.(IPC_CHANNELS.VIDEO_EDIT_GET_PLUGIN_METAS).then((metas: PluginMeta[]) => {
      setPlugins(metas)
    }).catch(() => {})

    api.invoke?.(IPC_CHANNELS.VIDEO_EDIT_GET_DEFAULTS).then((ops: VideoEditOperation[]) => {
      if (ops?.length) setOperations(ops)
    }).catch(() => {})
  }, [])

  // Receive init data from parent window (restores previously-saved state)
  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    const off = api.on?.(IPC_CHANNELS.VIDEO_EDITOR_INIT_DATA, (initData: any) => {
      if (!initData) return
      if (initData.videoEditOperations?.length) {
        setOperations(initData.videoEditOperations)
      }
      if (initData._previewVideoSrc) {
        setPreviewSrc(initData._previewVideoSrc)
      }
    })
    return () => { if (typeof off === 'function') off() }
  }, [])

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
      }
    } catch {}
  }, [])

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
  }, [plugins, operations.length])

  // Remove operation
  const handleRemoveOperation = useCallback((opId: string) => {
    setOperations(prev => prev.filter(o => o.id !== opId))
    if (selectedOpId === opId) setSelectedOpId(null)
  }, [selectedOpId])

  // Update params
  const handleUpdateParams = useCallback((opId: string, params: Record<string, any>) => {
    setOperations(prev => prev.map(o => o.id === opId ? { ...o, params } : o))
  }, [])

  // Toggle enabled
  const handleToggleEnabled = useCallback((opId: string) => {
    setOperations(prev => prev.map(o => o.id === opId ? { ...o, enabled: !o.enabled } : o))
  }, [])

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
    if (!api || !videoPath) return

    setIsRendering(true)
    setPreviewError(null)
    try {
      const result = await api.invoke(IPC_CHANNELS.VIDEO_EDIT_PREVIEW, {
        videoPath,
        operations: operations.filter(o => o.enabled),
      })
      if (result?.error) {
        setPreviewError(String(result.error))
        return
      }
      if (result?.outputPath) {
        setPreviewSrc(`file://${result.outputPath}?t=${Date.now()}`)
        return
      }
      setPreviewError('Preview render failed. Please check your operation parameters.')
    } catch (err: any) {
      console.error('[VideoEditor] Preview failed:', err)
      setPreviewError(err?.message || 'Preview render failed. Please try again.')
    } finally {
      setIsRendering(false)
    }
  }, [videoPath, operations])

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
  }, [operations, previewSrc])

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
    currentTime, previewSrc, previewError, isRendering,
    handleUploadVideo, handleAddOperation, handleRemoveOperation,
    handleUpdateParams, handleToggleEnabled, handleSelectOperation,
    handleSeek, handlePreview, handleDone,
    selectedOperation, selectedPlugin,
  }
}

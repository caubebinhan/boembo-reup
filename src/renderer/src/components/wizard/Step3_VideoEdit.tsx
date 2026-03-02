/**
 * Step3_VideoEdit — CapCut-style Video Editor (Wizard Step)
 * ─────────────────────────────────────────────────────────
 * Orchestrates: Toolbar (left) | Preview (center) | Properties (right) | Timeline (bottom)
 * Manages operation CRUD, video selection, and state sync between all sub-components.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { VideoCompositor } from './VideoCompositor'
import { EditorTimeline } from './EditorTimeline'
import { EditorToolbar } from './EditorToolbar'
import { EditorProperties } from './EditorProperties'

interface WizardStepProps {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

interface PluginMeta {
    id: string
    name: string
    group: string
    icon: string
    description: string
    previewHint: string
    defaultEnabled?: boolean
    allowMultipleInstances?: boolean
    addInstanceLabel?: string
    recommended?: boolean
    warning?: string
    configSchema: any[]
}

interface VideoEditOperation {
    id: string
    pluginId: string
    enabled: boolean
    params: Record<string, any>
    order: number
}

function generateOpId(): string {
    return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function Step3_VideoEdit({ data, updateData }: WizardStepProps) {
    // ── Plugin metadata from backend ──────────────────
    const [plugins, setPlugins] = useState<PluginMeta[]>([])
    const [pluginsLoading, setPluginsLoading] = useState(true)

    useEffect(() => {
        console.log('[Step3_VideoEdit] Mounted — loading plugin metadata via IPC…')
        const load = async () => {
            try {
                // @ts-ignore
                const metas = await window.api?.invoke?.('video-edit:get-plugin-metas')
                console.log(`[Step3_VideoEdit] Loaded ${metas?.length ?? 0} plugin(s):`, metas?.map?.((p: any) => p.id))
                if (metas) setPlugins(metas)
            } catch (e: any) {
                console.error('[Step3_VideoEdit] Failed to load plugin metadata:', e?.message || e)
            } finally {
                setPluginsLoading(false)
            }
        }
        load()
    }, [])

    // ── Operations (edits/effects/layers) ──────────────
    const operations: VideoEditOperation[] = useMemo(
        () => data.videoEditOperations || [],
        [data.videoEditOperations]
    )

    const setOperations = useCallback((ops: VideoEditOperation[]) => {
        updateData({ videoEditOperations: ops })
    }, [updateData])

    // ── Video source ──────────────────────────────────
    const [videoSrc, setVideoSrc] = useState<string | null>(data._previewVideoSrc || null)
    const [videoDuration, setVideoDuration] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)

    // ── Selected operation ────────────────────────────
    const [selectedOpId, setSelectedOpId] = useState<string | null>(null)

    const selectedOp = useMemo(
        () => operations.find(o => o.id === selectedOpId) || null,
        [operations, selectedOpId]
    )
    const selectedPlugin = useMemo(
        () => selectedOp ? plugins.find(p => p.id === selectedOp.pluginId) || null : null,
        [selectedOp, plugins]
    )

    // ── Auto-add defaults on first load ───────────────
    useEffect(() => {
        if (operations.length > 0 || pluginsLoading) return
        const defaults = plugins
            .filter(p => p.defaultEnabled || p.recommended)
            .map((p, i) => ({
                id: generateOpId(),
                pluginId: p.id,
                enabled: true,
                params: getDefaultParams(p),
                order: i,
            }))
        if (defaults.length > 0) setOperations(defaults)
    }, [plugins, pluginsLoading, operations.length, setOperations])

    // ── Handlers ──────────────────────────────────────

    const handleAddOperation = useCallback((pluginId: string) => {
        const plugin = plugins.find(p => p.id === pluginId)
        if (!plugin) return

        const newOp: VideoEditOperation = {
            id: generateOpId(),
            pluginId,
            enabled: true,
            params: getDefaultParams(plugin),
            order: operations.length,
        }
        const updated = [...operations, newOp]
        setOperations(updated)
        setSelectedOpId(newOp.id)
    }, [plugins, operations, setOperations])

    const handleUpdateParams = useCallback((opId: string, params: Record<string, any>) => {
        setOperations(operations.map(o =>
            o.id === opId ? { ...o, params } : o
        ))
    }, [operations, setOperations])

    const handleToggleEnabled = useCallback((opId: string) => {
        setOperations(operations.map(o =>
            o.id === opId ? { ...o, enabled: !o.enabled } : o
        ))
    }, [operations, setOperations])

    const handleRemoveOperation = useCallback((opId: string) => {
        setOperations(operations.filter(o => o.id !== opId))
        if (selectedOpId === opId) setSelectedOpId(null)
    }, [operations, setOperations, selectedOpId])

    const handlePositionChange = useCallback((opId: string, pos: { x: number; y: number }) => {
        setOperations(operations.map(o =>
            o.id === opId ? { ...o, params: { ...o.params, position: pos } } : o
        ))
    }, [operations, setOperations])

    const handleTimeUpdate = useCallback((time: number, dur: number) => {
        setCurrentTime(time)
        setVideoDuration(dur)
    }, [])

    const handleSeek = useCallback((time: number) => {
        setCurrentTime(time)
        // VideoCompositor will pick this up via video.currentTime
    }, [])

    const handleUploadVideo = useCallback(async () => {
        try {
            // @ts-ignore
            const result = await window.api?.invoke?.('dialog:open-file', {
                filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }]
            })
            if (result) {
                const fileUrl = result.startsWith('file://') ? result : `file://${result.replace(/\\/g, '/')}`
                setVideoSrc(fileUrl)
                updateData({ _previewVideoSrc: fileUrl })
            }
        } catch (e) {
            console.error('[Step3] Failed to open video:', e)
        }
    }, [updateData])

    // ── Loading state ─────────────────────────────────
    if (pluginsLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 rounded-2xl bg-purple-600/20 flex items-center justify-center text-2xl">🎬</div>
                    <span className="text-sm text-slate-400">Loading video editor...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col w-full h-full bg-slate-900 rounded-xl overflow-hidden" style={{ minHeight: 600 }}>
            {/* ── Top: Toolbar + Preview + Properties ────── */}
            <div className="flex flex-1 min-h-0">
                {/* Left: Toolbar */}
                <EditorToolbar plugins={plugins} onAddOperation={handleAddOperation} />

                {/* Center: Preview */}
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 px-4 py-3 min-w-0">
                    <VideoCompositor
                        videoSrc={videoSrc}
                        operations={operations}
                        plugins={plugins}
                        selectedOpId={selectedOpId}
                        onPositionChange={handlePositionChange}
                        onSelectOperation={setSelectedOpId}
                        onTimeUpdate={handleTimeUpdate}
                    />

                    {/* Upload button if no video */}
                    {!videoSrc && (
                        <button
                            onClick={handleUploadVideo}
                            className="mt-4 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition cursor-pointer shadow-lg shadow-purple-600/30 flex items-center gap-2"
                        >
                            <span>📁</span> Upload Preview Video
                        </button>
                    )}

                    {/* Controls below video */}
                    {videoSrc && (
                        <button
                            onClick={handleUploadVideo}
                            className="mt-2 text-[10px] text-slate-500 hover:text-slate-300 transition cursor-pointer"
                        >
                            Change video →
                        </button>
                    )}
                </div>

                {/* Right: Properties */}
                <div className="w-[280px] shrink-0 border-l border-slate-700 overflow-hidden">
                    <EditorProperties
                        operation={selectedOp}
                        plugin={selectedPlugin}
                        onUpdateParams={handleUpdateParams}
                        onToggleEnabled={handleToggleEnabled}
                        onRemoveOperation={handleRemoveOperation}
                    />
                </div>
            </div>

            {/* ── Bottom: Timeline ────────────────────────── */}
            <EditorTimeline
                operations={operations}
                plugins={plugins}
                duration={videoDuration}
                currentTime={currentTime}
                selectedOpId={selectedOpId}
                onSeek={handleSeek}
                onSelectOperation={setSelectedOpId}
            />
        </div>
    )
}

// ── Helpers ───────────────────────────────────────────

function getDefaultParams(plugin: PluginMeta): Record<string, any> {
    const params: Record<string, any> = {}
    for (const field of plugin.configSchema || []) {
        if (field.default !== undefined) {
            params[field.key] = field.default
        }
    }
    return params
}

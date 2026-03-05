/**
 * WizardVideoEdit — Launcher
 * ─────────────────────────
 * In the wizard, this step just shows:
 *   1. "Open Editor" button → opens a separate BrowserWindow
 *   2. Summary of current edits (after editor returns)
 *
 * The full editor UI lives in VideoEditorWindow.tsx
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

interface WizardStepProps {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

interface PluginMeta {
    id: string; name: string; group: string; icon: string
    description: string; previewHint: string
    defaultEnabled?: boolean; allowMultipleInstances?: boolean
    addInstanceLabel?: string; recommended?: boolean
    warning?: string; configSchema: any[]
}

interface VideoEditOperation {
    id: string; pluginId: string; enabled: boolean
    params: Record<string, any>; order: number
}

// ── Vintage Pastel Colors ──
export const V = {
    bg: '#fcfbf8',
    cream: '#f5f3ee',
    beige: '#e8e4db',
    card: '#ffffff',
    charcoal: '#2c2a29',
    textMuted: '#5c5551',
    textDim: '#8a827c',
    accent: '#7c3aed',
    accentHover: '#6d28d9',
    accentSoft: '#f3effe',
    pastelPink: '#f4dce0',
    pastelMint: '#d4e8d8',
    pastelBlue: '#d6e4f0',
    pastelPeach: '#f9e3d3',
    preview: '#f0ede6',
}

export function WizardVideoEdit({ data, updateData }: WizardStepProps) {
    const api = (window as any).api
    const [editorOpen, setEditorOpen] = useState(false)
    const [plugins, setPlugins] = useState<PluginMeta[]>([])
    const [error, setError] = useState<string | null>(null)

    // Keep a stable ref to updateData so the IPC listener always uses the latest callback
    const updateDataRef = useRef(updateData)
    useEffect(() => { updateDataRef.current = updateData }, [updateData])

    const operations: VideoEditOperation[] = useMemo(() => data.videoEditOps || [], [data.videoEditOps])
    const enabledPluginIds: string[] = useMemo(() => data._enabledPluginIds || [], [data._enabledPluginIds])

    // Load plugin metadata for summary display
    useEffect(() => {
        try {
            api?.invoke?.('video-edit:get-plugin-metas')
                .then((metas: PluginMeta[]) => { if (metas) setPlugins(metas) })
                .catch((err: any) => {
                    console.error('[WizardVideoEdit] Failed to load plugin metas:', err)
                    setError('Failed to load video edit plugins')
                })
        } catch (err: any) {
            console.error('[WizardVideoEdit] Plugin load error:', err)
            setError('Failed to load video edit plugins')
        }
    }, [api])

    // Listen for editor results — uses ref to avoid stale closure
    useEffect(() => {
        const off = api?.on?.('video-editor:done', (result: any) => {
            try {
                if (result) {
                    updateDataRef.current({
                        videoEditOps: result.videoEditOps || [],
                        _enabledPluginIds: result._enabledPluginIds || [],
                        _previewVideoSrc: result._previewVideoSrc || null,
                        _videoPath: result._videoPath || null,
                    })
                }
            } catch (err: any) {
                console.error('[WizardVideoEdit] Failed to save editor result:', err)
                setError('Failed to save editor settings')
            }
            setEditorOpen(false)
        })
        return () => { if (typeof off === 'function') off() }
    }, [api]) // No longer depends on updateData — uses ref instead

    // Open editor window
    const handleOpenEditor = useCallback(async () => {
        setEditorOpen(true)
        try {
            await api?.invoke?.('video-editor:open', {
                data: {
                    videoEditOps: data.videoEditOps || [],
                    _enabledPluginIds: data._enabledPluginIds || [],
                    _previewVideoSrc: data._previewVideoSrc || null,
                    _videoPath: data._videoPath || null,
                }
            })
        } catch (e) {
            console.error('[WizardVideoEdit] Failed to open editor:', e)
            setEditorOpen(false)
        }
    }, [api, data])

    // Summary helpers
    const enabledOps = useMemo(() => operations.filter(o => o.enabled), [operations])
    const getPlugin = useCallback((id: string) => plugins.find(p => p.id === id), [plugins])

    const groupedOps = useMemo(() => {
        const groups: Record<string, { plugin: PluginMeta; ops: VideoEditOperation[] }[]> = {}
        for (const op of enabledOps) {
            const plugin = getPlugin(op.pluginId)
            if (!plugin) continue
            const g = plugin.group || 'other'
            if (!groups[g]) groups[g] = []
            const existing = groups[g].find(x => x.plugin.id === plugin.id)
            if (existing) existing.ops.push(op)
            else groups[g].push({ plugin, ops: [op] })
        }
        return groups
    }, [enabledOps, getPlugin])

    const groupIcons: Record<string, string> = {
        'anti-detect': '🛡️', 'transform': '🔧', 'overlay': '🖼️', 'filter': '🎨', 'audio': '🔊',
    }

    return (
        <div className="flex flex-col items-center justify-center py-12 px-8 gap-8 min-h-[400px]">
            {/* Header */}
            <div className="text-center">
                <span className="text-5xl mb-4 block">🎬</span>
                <h2 className="text-lg font-bold mb-1" style={{ color: V.charcoal }}>Video Editing</h2>
                <p className="text-sm max-w-md mx-auto" style={{ color: V.textDim }}>
                    Configure video editing operations that will be applied to every downloaded video before uploading.
                </p>
            </div>

            {/* Open Editor Button */}
            <button
                onClick={handleOpenEditor}
                disabled={editorOpen}
                className="px-8 py-4 rounded-2xl text-base font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    background: editorOpen ? V.beige : `linear-gradient(135deg, ${V.accent}, ${V.accentHover})`,
                    color: editorOpen ? V.textDim : '#fff',
                    boxShadow: editorOpen ? 'none' : `0 4px 20px ${V.accent}44`,
                }}
            >
                {editorOpen ? '⏳ Editor is open...' : '🎬 Open Video Editor'}
            </button>
            {editorOpen && (
                <p className="text-[11px] animate-pulse" style={{ color: V.accent }}>
                    A new window has opened. Edit your video settings there and click "Done Editing" when finished.
                </p>
            )}

            {/* Edit Summary */}
            {enabledOps.length > 0 && (
                <div className="w-full max-w-lg"
                    style={{ background: V.card, border: `1px solid ${V.beige}`, borderRadius: 16, padding: '20px 24px' }}>
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"
                        style={{ color: V.textDim }}>
                        ✅ Current Edit Configuration
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: V.pastelMint, color: '#2e7d32' }}>
                            {enabledOps.length} operation{enabledOps.length !== 1 ? 's' : ''}
                        </span>
                    </h3>

                    <div className="flex flex-col gap-2">
                        {Object.entries(groupedOps).map(([group, items]) => (
                            <div key={group}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-xs">{groupIcons[group] || '📦'}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: V.textDim }}>{group}</span>
                                </div>
                                <div className="flex flex-col gap-1 ml-5">
                                    {items.map(({ plugin, ops }) => (
                                        <div key={plugin.id}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                                            style={{ background: V.cream }}>
                                            <span className="text-sm">{plugin.icon}</span>
                                            <span className="text-[11px] font-semibold flex-1" style={{ color: V.charcoal }}>
                                                {plugin.name}
                                            </span>
                                            {ops.length > 1 && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                                                    style={{ background: V.pastelBlue, color: '#1565c0' }}>
                                                    ×{ops.length}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="w-full max-w-lg px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                    style={{ background: V.pastelPink, color: '#9e3d4d', border: `1px solid #e0a8b0` }}>
                    <span>⚠️</span>
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="px-2 py-1 rounded-lg text-xs font-bold cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.5)' }}>✕</button>
                </div>
            )}

            {/* No edits yet */}
            {enabledOps.length === 0 && !editorOpen && !error && (
                <div className="text-center py-4">
                    <p className="text-[11px]" style={{ color: V.textDim }}>
                        No edits configured yet. Open the editor to add video editing operations.
                    </p>
                </div>
            )}

            {/* Plugin count */}
            {enabledPluginIds.length > 0 && (
                <p className="text-[10px]" style={{ color: V.textDim }}>
                    🧩 {enabledPluginIds.length} plugin{enabledPluginIds.length !== 1 ? 's' : ''} enabled
                </p>
            )}
        </div>
    )
}

/**
 * Video Editor Window — Compact Layout
 * ─────────────────────────────────────
 * Clean layout with native <video> preview, effect configuration,
 * and "Preview Result" button that runs actual FFmpeg rendering.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

// ── Theme ───────────────────────────────────────────
const V = {
    bg: '#faf8f5', cream: '#f5f0e8', card: '#ffffff', beige: '#e8e4db',
    charcoal: '#2c2a29', textDim: '#8a827c', accent: '#7c3aed', accentHover: '#6d28d9',
    accentSoft: '#ede9fe', preview: '#2c2a29',
    pastelMint: '#d1fae5', pastelBlue: '#dbeafe', pastelRose: '#fce7f3',
}

interface PluginMeta {
    id: string; name: string; group: string; icon: string; previewHint: string
    configSchema: any[]; description: string; defaultEnabled?: boolean; recommended?: boolean
    warning?: string; allowMultipleInstances?: boolean; addInstanceLabel?: string
}

interface VideoEditOperation {
    id: string; pluginId: string; enabled: boolean; params: Record<string, any>; order: number
}

function generateOpId() { return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` }

function getDefaultParams(p: PluginMeta) {
    const params: Record<string, any> = {}
    for (const f of p.configSchema) if (f.default !== undefined) params[f.key] = f.default
    return params
}

// ── Toggle Switch ───────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button onClick={e => { e.stopPropagation(); if (!disabled) onChange() }}
            className="relative rounded-full transition-all duration-200 shrink-0 cursor-pointer"
            style={{ width: 32, height: 18, background: checked ? V.accent : V.beige, opacity: disabled ? 0.5 : 1 }}>
            <div className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all duration-200"
                style={{ left: checked ? 14 : 2 }} />
        </button>
    )
}

// ── Field Renderer ──────────────────────────────────
function FieldRenderer({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
    const style = { fontSize: 11, color: V.charcoal, background: V.cream, border: `1px solid ${V.beige}`, borderRadius: 8, padding: '6px 10px', width: '100%', outline: 'none' }
    switch (field.type) {
        case 'number': case 'slider':
            return (
                <div>
                    <input type="range" min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1}
                        value={value ?? field.default ?? 0} onChange={e => onChange(Number(e.target.value))}
                        style={{ width: '100%', accentColor: V.accent }} />
                    <div className="flex justify-between" style={{ fontSize: 9, color: V.textDim }}>
                        <span>{field.min ?? 0}{field.unit || ''}</span>
                        <span style={{ color: V.accent, fontWeight: 700 }}>{value ?? field.default}{field.unit || ''}</span>
                        <span>{field.max ?? 100}{field.unit || ''}</span>
                    </div>
                </div>
            )
        case 'select':
            return (
                <select value={value ?? field.default} onChange={e => onChange(e.target.value)} style={style}>
                    {(field.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            )
        case 'boolean':
            return <ToggleSwitch checked={value ?? field.default ?? false} onChange={() => onChange(!(value ?? field.default ?? false))} />
        case 'string':
            return <input type="text" value={value ?? ''} placeholder={field.placeholder || ''} onChange={e => onChange(e.target.value)} style={style} />
        case 'color':
            return <input type="color" value={value ?? field.default ?? '#ffffff'} onChange={e => onChange(e.target.value)}
                style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
        case 'region':
            return (
                <div className="flex gap-2 flex-wrap">
                    {['x', 'y', 'w', 'h'].map(k => (
                        <div key={k} className="flex flex-col gap-0.5">
                            <span style={{ fontSize: 8, color: V.textDim, textTransform: 'uppercase' }}>{k}</span>
                            <input type="number" value={value?.[k] ?? 0} min={0}
                                onChange={e => onChange({ ...(value || {}), [k]: Number(e.target.value) })}
                                style={{ ...style, width: 60, padding: '4px 6px' }} />
                        </div>
                    ))}
                </div>
            )
        case 'timeRange':
            return (
                <div className="flex gap-2">
                    <div className="flex flex-col gap-0.5 flex-1">
                        <span style={{ fontSize: 8, color: V.textDim }}>START (s)</span>
                        <input type="number" step={0.1} min={0} value={value?.start ?? ''} placeholder="0"
                            onChange={e => onChange({ ...(value || {}), start: e.target.value ? Number(e.target.value) : undefined })} style={style} />
                    </div>
                    <div className="flex flex-col gap-0.5 flex-1">
                        <span style={{ fontSize: 8, color: V.textDim }}>END (s)</span>
                        <input type="number" step={0.1} min={0} value={value?.end ?? ''} placeholder="end"
                            onChange={e => onChange({ ...(value || {}), end: e.target.value ? Number(e.target.value) : undefined })} style={style} />
                    </div>
                </div>
            )
        default:
            return <span style={{ fontSize: 10, color: V.textDim }}>Unsupported: {field.type}</span>
    }
}

// ── Main Component ──────────────────────────────────
export function VideoEditorWindow() {
    const api = (window as any).api
    const [plugins, setPlugins] = useState<PluginMeta[]>([])
    const [pluginsLoading, setPluginsLoading] = useState(true)
    const [operations, setOperations] = useState<VideoEditOperation[]>([])
    const [globalEnabledIds, setGlobalEnabledIds] = useState<string[]>([])
    const [videoPath, setVideoPath] = useState<string | null>(null)
    const [selectedOpId, setSelectedOpId] = useState<string | null>(null)
    const [previewResult, setPreviewResult] = useState<string | null>(null)
    const [isRendering, setIsRendering] = useState(false)
    const [renderError, setRenderError] = useState<string | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const previewVideoRef = useRef<HTMLVideoElement>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [activeTab, setActiveTab] = useState<'effects' | 'plugins'>('effects')

    // Receive initial data
    useEffect(() => {
        const off = api?.on?.('video-editor:init-data', (data: any) => {
            if (data.videoEditOperations) setOperations(data.videoEditOperations)
            if (data._previewVideoSrc) setVideoPath(data._previewVideoSrc)
        })
        return () => { if (typeof off === 'function') off() }
    }, [api])

    // Load plugins
    useEffect(() => {
        Promise.all([
            api?.invoke?.('video-edit:get-plugin-metas'),
            api?.invoke?.('settings:get-enabled-plugins'),
        ]).then(([metas, ids]: [PluginMeta[], string[]]) => {
            setPlugins(metas || [])
            if (!ids || ids.length === 0) {
                const rec = (metas || []).filter((p: PluginMeta) => p.defaultEnabled || p.recommended).map((p: PluginMeta) => p.id)
                setGlobalEnabledIds(rec)
                api?.invoke?.('settings:set-enabled-plugins', rec)
            } else {
                setGlobalEnabledIds(ids)
            }
        }).catch(console.error).finally(() => setPluginsLoading(false))
    }, [api])

    // Auto-add defaults
    useEffect(() => {
        if (operations.length > 0 || pluginsLoading || globalEnabledIds.length === 0) return
        const defaults = plugins
            .filter(p => (p.defaultEnabled || p.recommended) && globalEnabledIds.includes(p.id))
            .map((p, i) => ({ id: generateOpId(), pluginId: p.id, enabled: true, params: getDefaultParams(p), order: i }))
        if (defaults.length > 0) setOperations(defaults)
    }, [plugins, pluginsLoading, operations.length, globalEnabledIds])

    const isGlobalEnabled = useCallback((id: string) => globalEnabledIds.includes(id), [globalEnabledIds])
    const toggleGlobalPlugin = useCallback((id: string) => {
        setGlobalEnabledIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
            api?.invoke?.('settings:set-enabled-plugins', next)
            return next
        })
    }, [api])

    const enabledPlugins = useMemo(() => plugins.filter(p => isGlobalEnabled(p.id)), [plugins, isGlobalEnabled])

    const selectedOp = useMemo(() => operations.find(o => o.id === selectedOpId) || null, [operations, selectedOpId])
    const selectedPlugin = useMemo(() => selectedOp ? plugins.find(p => p.id === selectedOp.pluginId) || null : null, [selectedOp, plugins])

    const handleAddOp = useCallback((pluginId: string) => {
        const plugin = plugins.find(p => p.id === pluginId)
        if (!plugin) return
        const newOp: VideoEditOperation = { id: generateOpId(), pluginId, enabled: true, params: getDefaultParams(plugin), order: operations.length }
        setOperations([...operations, newOp])
        setSelectedOpId(newOp.id)
    }, [plugins, operations])

    const handleUpdateParams = useCallback((opId: string, key: string, val: any) => {
        setOperations(ops => ops.map(o => o.id === opId ? { ...o, params: { ...o.params, [key]: val } } : o))
    }, [])

    const handleToggle = useCallback((opId: string) => {
        setOperations(ops => ops.map(o => o.id === opId ? { ...o, enabled: !o.enabled } : o))
    }, [])

    const handleRemove = useCallback((opId: string) => {
        setOperations(ops => ops.filter(o => o.id !== opId))
        if (selectedOpId === opId) setSelectedOpId(null)
    }, [selectedOpId])

    const handleLoadVideo = useCallback(async () => {
        try {
            const result = await api?.invoke?.('dialog:open-file', {
                filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }]
            })
            if (result) {
                setVideoPath(result)
                setPreviewResult(null)
                setShowPreview(false)
            }
        } catch (e) { console.error('Failed to open video:', e) }
    }, [api])

    const handlePreview = useCallback(async () => {
        if (!videoPath) return
        setIsRendering(true)
        setRenderError(null)
        try {
            const result = await api?.invoke?.('video-edit:preview', { videoPath, operations })
            if (result?.outputPath) {
                setPreviewResult(result.outputPath)
                setShowPreview(true)
            }
        } catch (e: any) {
            setRenderError(e?.message || 'Preview rendering failed')
        } finally {
            setIsRendering(false)
        }
    }, [api, videoPath, operations])

    const handleDone = useCallback(() => {
        api?.invoke?.('video-editor:done', {
            videoEditOperations: operations,
            summary: operations.filter(o => o.enabled).map(o => {
                const p = plugins.find(pl => pl.id === o.pluginId)
                return p ? `${p.icon} ${p.name}` : o.pluginId
            }).join(', ')
        })
    }, [api, operations, plugins])

    // Helper: get visible fields for a plugin (respecting conditions)
    const getVisibleFields = useCallback((plugin: PluginMeta, params: Record<string, any>) => {
        return plugin.configSchema.filter(f => {
            if (!f.condition) return true
            return params[f.condition.field] === f.condition.value
        })
    }, [])

    return (
        <div className="flex flex-col h-screen select-none" style={{ background: V.bg, fontFamily: "'Inter', sans-serif" }}>
            {/* Header */}
            <header className="flex items-center justify-between px-5 shrink-0"
                style={{ height: 48, background: V.cream, borderBottom: `1px solid ${V.beige}` }}>
                <div className="flex items-center gap-3">
                    <span className="text-lg">🎬</span>
                    <h1 className="text-sm font-bold" style={{ color: V.charcoal }}>Video Editor</h1>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: V.accentSoft, color: V.accent }}>
                        {operations.filter(o => o.enabled).length} active
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleLoadVideo}
                        className="px-3 py-1.5 text-[10px] font-bold rounded-full cursor-pointer transition"
                        style={{ background: V.cream, color: V.charcoal, border: `1px solid ${V.beige}` }}>
                        📁 Load Video
                    </button>
                    <button onClick={handlePreview} disabled={!videoPath || isRendering}
                        className="px-3 py-1.5 text-[10px] font-bold rounded-full cursor-pointer transition"
                        style={{
                            background: isRendering ? V.beige : V.pastelMint,
                            color: isRendering ? V.textDim : '#2e7d32',
                            border: `1px solid ${isRendering ? V.beige : '#a7f3d0'}`,
                        }}>
                        {isRendering ? '⏳ Rendering...' : '▶ Preview Result'}
                    </button>
                    <button onClick={handleDone}
                        className="px-4 py-1.5 text-xs font-bold rounded-full cursor-pointer transition-all active:scale-95"
                        style={{ background: V.accent, color: '#fff', boxShadow: `0 2px 10px ${V.accent}33` }}>
                        ✓ Done
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left: Video Preview */}
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ background: V.preview }}>
                        {!videoPath ? (
                            <div className="flex flex-col items-center gap-3">
                                <span className="text-5xl opacity-30">🎬</span>
                                <p className="text-sm" style={{ color: '#aaa' }}>No video loaded</p>
                                <button onClick={handleLoadVideo}
                                    className="px-5 py-2 text-sm font-bold rounded-2xl cursor-pointer transition-all"
                                    style={{ background: V.accent, color: '#fff' }}>
                                    📁 Load Video
                                </button>
                            </div>
                        ) : (
                            <div className="relative w-full h-full flex items-center justify-center">
                                {/* Original video */}
                                <video ref={videoRef} src={videoPath} controls
                                    className="max-w-full max-h-full"
                                    style={{
                                        display: showPreview ? 'none' : 'block',
                                        borderRadius: 4,
                                        maxHeight: 'calc(100% - 16px)',
                                        maxWidth: 'calc(100% - 16px)',
                                    }} />
                                {/* Preview result */}
                                {showPreview && previewResult && (
                                    <video ref={previewVideoRef} src={previewResult} controls autoPlay
                                        className="max-w-full max-h-full"
                                        style={{
                                            borderRadius: 4,
                                            maxHeight: 'calc(100% - 16px)',
                                            maxWidth: 'calc(100% - 16px)',
                                        }} />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Preview toggle bar */}
                    {videoPath && (
                        <div className="flex items-center justify-center gap-3 shrink-0 px-3"
                            style={{ height: 36, background: V.cream, borderTop: `1px solid ${V.beige}` }}>
                            <button onClick={() => setShowPreview(false)}
                                className="px-3 py-1 text-[10px] font-bold rounded-full cursor-pointer"
                                style={{ background: !showPreview ? V.accent : 'transparent', color: !showPreview ? '#fff' : V.textDim }}>
                                Original
                            </button>
                            <button onClick={() => previewResult && setShowPreview(true)} disabled={!previewResult}
                                className="px-3 py-1 text-[10px] font-bold rounded-full cursor-pointer"
                                style={{
                                    background: showPreview ? '#2e7d32' : 'transparent',
                                    color: showPreview ? '#fff' : previewResult ? '#2e7d32' : V.textDim,
                                    opacity: previewResult ? 1 : 0.4,
                                }}>
                                Rendered Preview
                            </button>
                            {renderError && (
                                <span className="text-[9px] text-red-500 truncate max-w-[200px]">❌ {renderError}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Panel */}
                <div className="flex flex-col shrink-0 overflow-hidden"
                    style={{ width: 340, borderLeft: `1px solid ${V.beige}`, background: V.bg }}>

                    {/* Tabs */}
                    <div className="flex shrink-0" style={{ borderBottom: `1px solid ${V.beige}` }}>
                        {(['effects', 'plugins'] as const).map(t => (
                            <button key={t} onClick={() => setActiveTab(t)}
                                className="flex-1 py-2 text-[10px] font-bold tracking-widest uppercase text-center cursor-pointer transition"
                                style={{
                                    color: activeTab === t ? V.accent : V.textDim,
                                    borderBottom: activeTab === t ? `2px solid ${V.accent}` : '2px solid transparent',
                                    background: activeTab === t ? V.accentSoft : 'transparent',
                                }}>
                                {t === 'effects' ? `🎨 Edits (${operations.filter(o => o.enabled).length})` : '🧩 Plugins'}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {activeTab === 'plugins' ? (
                            /* ── Plugins Tab ── */
                            <div className="px-3 py-3">
                                <p className="text-[10px] mb-3" style={{ color: V.textDim }}>
                                    Enable/disable plugins. Only enabled plugins can be added as effects.
                                </p>
                                {(['anti-detect', 'transform', 'overlay', 'filter', 'audio'] as const).map(group => {
                                    const gp = plugins.filter(p => p.group === group)
                                    if (gp.length === 0) return null
                                    const icons: Record<string, string> = { 'anti-detect': '🛡️', transform: '🔧', overlay: '🖼️', filter: '🎨', audio: '🔊' }
                                    return (
                                        <div key={group} className="mb-3">
                                            <h4 className="text-[9px] font-bold tracking-widest uppercase mb-1.5 px-1"
                                                style={{ color: V.textDim }}>{icons[group]} {group}</h4>
                                            {gp.map(p => {
                                                const en = isGlobalEnabled(p.id)
                                                return (
                                                    <div key={p.id}
                                                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                                                        style={{ background: en ? V.card : 'transparent', border: `1px solid ${en ? V.beige : 'transparent'}`, opacity: en ? 1 : 0.45 }}
                                                        onClick={() => toggleGlobalPlugin(p.id)}>
                                                        <span className="text-sm shrink-0">{p.icon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-semibold truncate" style={{ color: en ? V.charcoal : V.textDim }}>{p.name}</p>
                                                        </div>
                                                        <ToggleSwitch checked={en} onChange={() => toggleGlobalPlugin(p.id)} />
                                                        {p.recommended && en && (
                                                            <span className="text-[7px] px-1 py-0.5 rounded font-bold shrink-0"
                                                                style={{ background: V.pastelMint, color: '#2e7d32' }}>REC</span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            /* ── Effects Tab ── */
                            <div className="px-3 py-3">
                                {/* Add effect dropdown */}
                                <div className="mb-3">
                                    <select
                                        onChange={e => { if (e.target.value) { handleAddOp(e.target.value); e.target.value = '' } }}
                                        value=""
                                        className="w-full text-[11px] font-semibold rounded-lg cursor-pointer"
                                        style={{ padding: '8px 10px', background: V.accentSoft, color: V.accent, border: `1px solid ${V.accent}33`, outline: 'none' }}>
                                        <option value="" disabled>＋ Add Effect...</option>
                                        {enabledPlugins.map(p => (
                                            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Operation list */}
                                {operations.length === 0 ? (
                                    <div className="flex flex-col items-center py-6 gap-2">
                                        <span className="text-3xl opacity-30">✋</span>
                                        <p className="text-[10px] text-center" style={{ color: V.textDim }}>
                                            No effects yet. Add from dropdown above.
                                        </p>
                                    </div>
                                ) : operations.map(op => {
                                    const plugin = plugins.find(p => p.id === op.pluginId)
                                    if (!plugin) return null
                                    const isSelected = op.id === selectedOpId
                                    const visibleFields = getVisibleFields(plugin, op.params)
                                    return (
                                        <div key={op.id} className="mb-2 rounded-xl overflow-hidden transition-all"
                                            style={{
                                                background: V.card,
                                                border: `1px solid ${isSelected ? `${V.accent}44` : V.beige}`,
                                                opacity: op.enabled ? 1 : 0.5,
                                            }}>
                                            {/* Header */}
                                            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                                                onClick={() => setSelectedOpId(isSelected ? null : op.id)}
                                                style={{ borderBottom: isSelected ? `1px solid ${V.beige}` : 'none' }}>
                                                <span className="text-sm shrink-0">{plugin.icon}</span>
                                                <p className="text-[11px] font-semibold truncate flex-1" style={{ color: V.charcoal }}>{plugin.name}</p>
                                                <ToggleSwitch checked={op.enabled} onChange={() => handleToggle(op.id)} />
                                                <button onClick={e => { e.stopPropagation(); handleRemove(op.id) }}
                                                    className="shrink-0 text-xs cursor-pointer p-0.5 rounded transition"
                                                    style={{ color: V.textDim }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = V.textDim)}>🗑</button>
                                            </div>
                                            {/* Expanded params */}
                                            {isSelected && (
                                                <div className="px-3 py-2.5 flex flex-col gap-2.5">
                                                    {plugin.warning && (
                                                        <p className="text-[9px] px-2 py-1.5 rounded-lg" style={{ background: V.pastelRose, color: '#b91c1c' }}>{plugin.warning}</p>
                                                    )}
                                                    {visibleFields.map(field => (
                                                        <div key={field.key}>
                                                            <label className="text-[10px] font-semibold mb-1 block" style={{ color: V.charcoal }}>
                                                                {field.label}
                                                                {field.description && (
                                                                    <span className="font-normal ml-1" style={{ color: V.textDim }}>— {field.description}</span>
                                                                )}
                                                            </label>
                                                            <FieldRenderer field={field} value={op.params[field.key]}
                                                                onChange={v => handleUpdateParams(op.id, field.key, v)} />
                                                        </div>
                                                    ))}
                                                    {visibleFields.length === 0 && (
                                                        <p className="text-[10px]" style={{ color: V.textDim }}>No configurable options.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

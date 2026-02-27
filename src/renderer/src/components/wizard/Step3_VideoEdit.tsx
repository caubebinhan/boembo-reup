/**
 * Step3_VideoEdit — Wizard Step
 * ─────────────────────────────
 * Plugin browser + config UI for video editing operations.
 * Users can browse plugins by group, add operations (multi-instance),
 * configure params via auto-rendered forms, and reorder operations.
 *
 * Data stored in wizard.data:
 *   - videoEditOperations: VideoEditOperation[]
 *   - videoEditAssets: Record<string, { type, path, name }>
 */
import { useState, useCallback, useMemo, useEffect } from 'react'

// ── Types (shared with core — inlined for renderer isolation) ───
// These mirror src/core/video-edit/types.ts for the renderer side

interface PluginConfigField {
    key: string
    type: string
    label: string
    default?: any
    min?: number
    max?: number
    step?: number
    unit?: string
    options?: Array<{ value: string; label: string; icon?: string }>
    description?: string
    condition?: { field: string; value: any }
    isArray?: boolean
    arrayFields?: PluginConfigField[]
    placeholder?: string
    required?: boolean
}

interface PluginMeta {
    id: string
    name: string
    group: string
    icon: string
    description: string
    defaultEnabled?: boolean
    allowMultipleInstances?: boolean
    addInstanceLabel?: string
    recommended?: boolean
    warning?: string
    configSchema: PluginConfigField[]
}

interface VideoEditOperation {
    id: string
    pluginId: string
    enabled: boolean
    params: Record<string, any>
    order: number
}

// ── Plugin groups for UI tabs ───────────────────────
const PLUGIN_GROUPS = [
    { key: 'anti-detect', label: 'Anti-Detect', icon: '🛡️', color: '#ef4444' },
    { key: 'transform', label: 'Transform', icon: '🔄', color: '#3b82f6' },
    { key: 'overlay', label: 'Overlay', icon: '🏷️', color: '#8b5cf6' },
    { key: 'filter', label: 'Filter', icon: '🎨', color: '#f59e0b' },
    { key: 'audio', label: 'Audio', icon: '🎵', color: '#10b981' },
]

// ── Helpers ──────────────────────────────────────────

function genId(): string {
    return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function getDefaultParams(plugin: PluginMeta): Record<string, any> {
    const params: Record<string, any> = {}
    for (const f of plugin.configSchema) {
        if (f.default !== undefined) params[f.key] = f.default
    }
    return params
}

// ── Position Picker Widget ──────────────────────────

const POSITION_LABELS: Record<string, string> = {
    'top-left': '↖', 'top-center': '↑', 'top-right': '↗',
    'center-left': '←', 'center': '•', 'center-right': '→',
    'bottom-left': '↙', 'bottom-center': '↓', 'bottom-right': '↘',
}

function PositionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const positions = Object.keys(POSITION_LABELS)
    return (
        <div className="inline-grid grid-cols-3 gap-1 bg-slate-100 rounded-lg p-1.5">
            {positions.map((pos) => (
                <button
                    key={pos}
                    onClick={() => onChange(pos)}
                    className={`w-8 h-8 rounded text-sm font-bold transition cursor-pointer ${value === pos
                        ? 'bg-purple-500 text-white shadow-sm'
                        : 'bg-white text-slate-400 hover:bg-purple-50 hover:text-purple-500'
                        }`}
                >
                    {POSITION_LABELS[pos]}
                </button>
            ))}
        </div>
    )
}

// ── Time Range Widget ───────────────────────────────

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function parseTime(str: string): number {
    const parts = str.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return Number(str) || 0
}

function TimeRangeInput({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const start = value?.start ?? 0
    const end = value?.end ?? 0
    return (
        <div className="flex items-center gap-2 text-sm">
            <input
                type="text"
                className="w-16 text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:border-purple-400 outline-none"
                value={formatTime(start)}
                onChange={(e) => onChange({ start: parseTime(e.target.value), end })}
                placeholder="00:00"
            />
            <span className="text-slate-400">→</span>
            <input
                type="text"
                className="w-16 text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:border-purple-400 outline-none"
                value={end ? formatTime(end) : ''}
                onChange={(e) => onChange({ start, end: parseTime(e.target.value) })}
                placeholder="end"
            />
        </div>
    )
}

// ── Generic Field Renderer ──────────────────────────

function FieldRenderer({ field, value, onChange, params }: {
    field: PluginConfigField
    value: any
    onChange: (v: any) => void
    params: Record<string, any>
}) {
    // Check condition
    if (field.condition) {
        if (params[field.condition.field] !== field.condition.value) return null
    }

    switch (field.type) {
        case 'boolean':
            return (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={value ?? field.default ?? false}
                        onChange={(e) => onChange(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-xs text-slate-600">{field.label}</span>
                    {field.description && <span className="text-[10px] text-slate-400 ml-1">({field.description})</span>}
                </label>
            )

        case 'slider':
            return (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{field.label}</span>
                        <span className="text-xs font-mono text-purple-600 font-semibold">{value ?? field.default}{field.unit ? ` ${field.unit}` : ''}</span>
                    </div>
                    <input
                        type="range"
                        min={field.min ?? 0}
                        max={field.max ?? 100}
                        step={field.step ?? 1}
                        value={value ?? field.default ?? field.min ?? 0}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                </div>
            )

        case 'select':
            return (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <div className="flex flex-wrap gap-1.5">
                        {field.options?.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => onChange(opt.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer ${(value ?? field.default) === opt.value
                                    ? 'bg-purple-100 text-purple-700 border border-purple-300 font-semibold'
                                    : 'bg-white text-slate-500 border border-slate-200 hover:border-purple-200'
                                    }`}
                            >
                                {opt.icon && <span className="mr-1">{opt.icon}</span>}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )

        case 'number':
            return (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={value ?? field.default ?? ''}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:border-purple-400 outline-none"
                    />
                    {field.description && <span className="text-[10px] text-slate-400">{field.description}</span>}
                </div>
            )

        case 'string':
            return (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <input
                        type="text"
                        value={value ?? field.default ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:border-purple-400 outline-none"
                    />
                </div>
            )

        case 'color':
            return (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <input
                        type="color"
                        value={value ?? field.default ?? '#000000'}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">{value ?? field.default}</span>
                </div>
            )

        case 'position':
            return (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <PositionPicker value={value ?? field.default ?? 'center'} onChange={onChange} />
                </div>
            )

        case 'timeRange':
            return (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <TimeRangeInput value={value} onChange={onChange} />
                    {field.description && <span className="text-[10px] text-slate-400">{field.description}</span>}
                </div>
            )

        case 'time':
            return (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <input
                        type="text"
                        className="w-16 text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:border-purple-400 outline-none"
                        value={value != null ? formatTime(value) : formatTime(field.default ?? 0)}
                        onChange={(e) => onChange(parseTime(e.target.value))}
                        placeholder="00:00"
                    />
                </div>
            )

        case 'asset':
            return (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={value ?? ''}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="Enter file path or asset ID..."
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:border-purple-400 outline-none font-mono"
                        />
                        <button className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-xs font-semibold border border-purple-200 hover:bg-purple-100 transition cursor-pointer">
                            Browse
                        </button>
                    </div>
                </div>
            )

        case 'region':
            return (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    <div className="grid grid-cols-4 gap-1.5">
                        {['x', 'y', 'w', 'h'].map((k) => (
                            <div key={k} className="flex flex-col">
                                <span className="text-[10px] text-slate-400 uppercase">{k}</span>
                                <input
                                    type="number"
                                    value={value?.[k] ?? 0}
                                    onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
                                    className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono focus:border-purple-400 outline-none w-full"
                                />
                            </div>
                        ))}
                    </div>
                    {field.description && <span className="text-[10px] text-slate-400">{field.description}</span>}
                </div>
            )

        default:
            return null
    }
}

// ── Operation Card ──────────────────────────────────

function OperationCard({ operation, plugin, onUpdate, onRemove, onToggle, onMoveUp, onMoveDown, isFirst, isLast }: {
    operation: VideoEditOperation
    plugin: PluginMeta
    onUpdate: (params: Record<string, any>) => void
    onRemove: () => void
    onToggle: () => void
    onMoveUp: () => void
    onMoveDown: () => void
    isFirst: boolean
    isLast: boolean
}) {
    const [expanded, setExpanded] = useState(true)
    const groupInfo = PLUGIN_GROUPS.find((g) => g.key === plugin.group)

    return (
        <div className={`rounded-xl border-2 transition ${operation.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
            }`}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2">
                {/* Drag handle + reorder */}
                <div className="flex flex-col gap-0.5">
                    <button onClick={onMoveUp} disabled={isFirst} className={`text-[10px] leading-none cursor-pointer ${isFirst ? 'text-slate-200' : 'text-slate-400 hover:text-purple-500'}`}>▲</button>
                    <button onClick={onMoveDown} disabled={isLast} className={`text-[10px] leading-none cursor-pointer ${isLast ? 'text-slate-200' : 'text-slate-400 hover:text-purple-500'}`}>▼</button>
                </div>

                {/* Enable toggle */}
                <button onClick={onToggle} className={`w-8 h-4 rounded-full transition cursor-pointer relative ${operation.enabled ? 'bg-purple-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${operation.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>

                {/* Plugin info */}
                <span className="text-base">{plugin.icon}</span>
                <span className="text-sm font-medium text-slate-700 flex-1">{plugin.name}</span>

                {/* Group badge */}
                {groupInfo && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${groupInfo.color}15`, color: groupInfo.color }}
                    >
                        {groupInfo.label}
                    </span>
                )}

                {/* Recommended badge */}
                {plugin.recommended && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-50 text-green-600">
                        ✓ Recommended
                    </span>
                )}

                {/* Expand/collapse */}
                <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-purple-500 text-xs px-1 cursor-pointer">
                    {expanded ? '▼' : '▶'}
                </button>

                {/* Remove */}
                <button onClick={onRemove} className="text-slate-300 hover:text-red-500 text-sm px-1 transition cursor-pointer" title="Remove">✕</button>
            </div>

            {/* Config fields */}
            {expanded && operation.enabled && (
                <div className="px-4 pb-3 flex flex-col gap-2.5 border-t border-slate-100 pt-2.5">
                    {/* Warning banner */}
                    {plugin.warning && (
                        <div className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
                            {plugin.warning}
                        </div>
                    )}
                    {plugin.configSchema.map((field) => (
                        <FieldRenderer
                            key={field.key}
                            field={field}
                            value={operation.params[field.key]}
                            onChange={(v) => onUpdate({ ...operation.params, [field.key]: v })}
                            params={operation.params}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Plugin Browser ──────────────────────────────────

function PluginBrowser({ plugins, onAdd, existingPluginIds }: {
    plugins: PluginMeta[]
    onAdd: (pluginId: string) => void
    existingPluginIds: Set<string>
}) {
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

    const filteredPlugins = selectedGroup
        ? plugins.filter((p) => p.group === selectedGroup)
        : plugins

    return (
        <div className="flex flex-col gap-3">
            {/* Group tabs */}
            <div className="flex gap-1.5 flex-wrap">
                <button
                    onClick={() => setSelectedGroup(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${!selectedGroup ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    All
                </button>
                {PLUGIN_GROUPS.map((g) => (
                    <button
                        key={g.key}
                        onClick={() => setSelectedGroup(g.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${selectedGroup === g.key
                            ? 'text-white'
                            : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                        style={selectedGroup === g.key ? { background: g.color } : undefined}
                    >
                        {g.icon} {g.label}
                    </button>
                ))}
            </div>

            {/* Plugin list */}
            <div className="grid grid-cols-2 gap-2">
                {filteredPlugins.map((plugin) => {
                    const alreadyAdded = existingPluginIds.has(plugin.id) && !plugin.allowMultipleInstances
                    const groupInfo = PLUGIN_GROUPS.find((g) => g.key === plugin.group)
                    return (
                        <button
                            key={plugin.id}
                            onClick={() => !alreadyAdded && onAdd(plugin.id)}
                            disabled={alreadyAdded}
                            className={`text-left p-3 rounded-xl border transition cursor-pointer ${alreadyAdded
                                ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                                : 'border-slate-200 bg-white hover:border-purple-300 hover:shadow-sm'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{plugin.icon}</span>
                                <span className="text-sm font-semibold text-slate-700">{plugin.name}</span>
                                {plugin.recommended && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-green-50 text-green-600 border border-green-200">Recommended</span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">{plugin.description}</p>
                            {plugin.warning && (
                                <p className="text-[10px] text-amber-500 leading-snug mt-0.5">{plugin.warning}</p>
                            )}
                            {alreadyAdded && <span className="text-[10px] text-green-500 font-semibold mt-1 block">✓ Added</span>}
                            {plugin.allowMultipleInstances && existingPluginIds.has(plugin.id) && (
                                <span className="text-[10px] text-purple-500 font-semibold mt-1 block">+ Add another</span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Main Step Component ─────────────────────────────

interface Step3Props {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

export function Step3_VideoEdit({ data, updateData }: Step3Props) {
    const [showBrowser, setShowBrowser] = useState(false)
    const [availablePlugins, setAvailablePlugins] = useState<PluginMeta[]>([])

    // Load plugin metadata from backend registry via IPC
    useEffect(() => {
        window.api?.invoke('video-edit:get-plugins').then((plugins: PluginMeta[]) => {
            if (plugins?.length) setAvailablePlugins(plugins)
        }).catch(() => {
            // IPC not available (e.g. in dev/test) — will show empty
        })
    }, [])

    const getPluginById = useCallback((id: string) => {
        return availablePlugins.find((p) => p.id === id)
    }, [availablePlugins])

    const operations: VideoEditOperation[] = data.videoEditOperations || []

    const setOperations = useCallback((ops: VideoEditOperation[]) => {
        updateData({ videoEditOperations: ops })
    }, [updateData])

    // Load default operations from backend when plugins are available
    useEffect(() => {
        if (!data.videoEditOperations && availablePlugins.length > 0) {
            window.api?.invoke('video-edit:get-defaults').then((defaults: VideoEditOperation[]) => {
                if (defaults?.length) updateData({ videoEditOperations: defaults })
            }).catch(() => {
                // Fallback: create defaults from available plugins
                const defaults: VideoEditOperation[] = availablePlugins
                    .filter((p) => p.defaultEnabled)
                    .map((p, i) => ({
                        id: genId(),
                        pluginId: p.id,
                        enabled: true,
                        params: getDefaultParams(p),
                        order: i,
                    }))
                updateData({ videoEditOperations: defaults })
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availablePlugins])

    const existingPluginIds = useMemo(() => new Set(operations.map((o) => o.pluginId)), [operations])

    const addOperation = useCallback((pluginId: string) => {
        const plugin = availablePlugins.find((p) => p.id === pluginId)
        if (!plugin) return
        const newOp: VideoEditOperation = {
            id: genId(),
            pluginId,
            enabled: true,
            params: getDefaultParams(plugin),
            order: operations.length,
        }
        setOperations([...operations, newOp])
        setShowBrowser(false)
    }, [operations, setOperations])

    const removeOperation = useCallback((id: string) => {
        setOperations(operations.filter((o) => o.id !== id))
    }, [operations, setOperations])

    const updateOperation = useCallback((id: string, params: Record<string, any>) => {
        setOperations(operations.map((o) => o.id === id ? { ...o, params } : o))
    }, [operations, setOperations])

    const toggleOperation = useCallback((id: string) => {
        setOperations(operations.map((o) => o.id === id ? { ...o, enabled: !o.enabled } : o))
    }, [operations, setOperations])

    const moveOperation = useCallback((id: string, dir: -1 | 1) => {
        const idx = operations.findIndex((o) => o.id === id)
        if (idx < 0) return
        const newIdx = idx + dir
        if (newIdx < 0 || newIdx >= operations.length) return
        const newOps = [...operations]
            ;[newOps[idx], newOps[newIdx]] = [newOps[newIdx], newOps[idx]]
        newOps.forEach((o, i) => o.order = i)
        setOperations(newOps)
    }, [operations, setOperations])

    const enabledCount = operations.filter((o) => o.enabled).length

    return (
        <div className="flex flex-col gap-6 text-slate-800 max-w-3xl mx-auto pb-10">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-lg text-slate-800">🎬 Video Editing</h3>
                    <p className="text-sm text-slate-400">
                        {enabledCount} operation{enabledCount !== 1 ? 's' : ''} active • Add more below
                    </p>
                </div>
                <button
                    onClick={() => setShowBrowser(!showBrowser)}
                    className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-600 transition shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                    <span className="text-base">+</span>
                    Add Operation
                </button>
            </div>

            {/* Plugin browser (collapsible) */}
            {showBrowser && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-sm text-slate-600">Choose an operation to add</h4>
                        <button onClick={() => setShowBrowser(false)} className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer">✕</button>
                    </div>
                    <PluginBrowser plugins={availablePlugins} onAdd={addOperation} existingPluginIds={existingPluginIds} />
                </div>
            )}

            {/* Operations list */}
            {operations.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {operations.map((op, idx) => {
                        const plugin = getPluginById(op.pluginId)
                        if (!plugin) return null
                        return (
                            <OperationCard
                                key={op.id}
                                operation={op}
                                plugin={plugin}
                                onUpdate={(params) => updateOperation(op.id, params)}
                                onRemove={() => removeOperation(op.id)}
                                onToggle={() => toggleOperation(op.id)}
                                onMoveUp={() => moveOperation(op.id, -1)}
                                onMoveDown={() => moveOperation(op.id, 1)}
                                isFirst={idx === 0}
                                isLast={idx === operations.length - 1}
                            />
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <p className="text-4xl mb-3">🎬</p>
                    <p className="text-slate-500 text-sm font-medium">No editing operations added yet</p>
                    <p className="text-slate-400 text-xs mt-1">Click "Add Operation" to start</p>
                </div>
            )}

            {/* Execution order info */}
            {operations.length > 1 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Execution Order</p>
                    <p className="text-xs text-slate-500">
                        Operations are applied top → bottom. Use ▲▼ to reorder.
                        Anti-detect plugins are recommended at the end for best results.
                    </p>
                </div>
            )}
        </div>
    )
}

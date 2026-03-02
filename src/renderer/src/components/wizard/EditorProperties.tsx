/**
 * EditorProperties — Right panel for selected operation config
 * ─────────────────────────────────────────────────────────────
 * Shows the config form for the currently selected operation.
 * Fields auto-rendered from plugin's configSchema.
 * Non-visual plugins show a "⚡ Applied at render time" badge.
 */
import { useMemo } from 'react'

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
    placeholder?: string
    required?: boolean
}

interface PluginMeta {
    id: string
    name: string
    group: string
    icon: string
    description: string
    previewHint: string
    configSchema: PluginConfigField[]
}

interface VideoEditOperation {
    id: string
    pluginId: string
    enabled: boolean
    params: Record<string, any>
    order: number
}

interface EditorPropertiesProps {
    operation: VideoEditOperation | null
    plugin: PluginMeta | null
    onUpdateParams: (opId: string, params: Record<string, any>) => void
    onToggleEnabled: (opId: string) => void
    onRemoveOperation: (opId: string) => void
}

export function EditorProperties({
    operation,
    plugin,
    onUpdateParams,
    onToggleEnabled,
    onRemoveOperation,
}: EditorPropertiesProps) {
    if (!operation || !plugin) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl mb-3">
                    🎬
                </div>
                <p className="text-sm font-medium text-slate-400">It's empty here</p>
                <p className="text-xs text-slate-500 mt-1">Click an element on the timeline<br />to edit its properties</p>
            </div>
        )
    }

    // Filter fields by condition
    const visibleFields = useMemo(() => {
        return plugin.configSchema.filter(field => {
            if (!field.condition) return true
            return operation.params[field.condition.field] === field.condition.value
        })
    }, [plugin.configSchema, operation.params])

    const updateParam = (key: string, value: any) => {
        onUpdateParams(operation.id, { ...operation.params, [key]: value })
    }

    return (
        <div className="flex flex-col h-full bg-slate-900">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                <span className="text-lg">{plugin.icon}</span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-200 truncate">{plugin.name}</h3>
                    <p className="text-[10px] text-slate-500">{plugin.group}</p>
                </div>
                <button
                    onClick={() => onToggleEnabled(operation.id)}
                    className={`text-[10px] px-2 py-1 rounded-md cursor-pointer transition ${operation.enabled
                            ? 'bg-emerald-600/20 text-emerald-400'
                            : 'bg-slate-700 text-slate-500'
                        }`}
                >
                    {operation.enabled ? '● ON' : '○ OFF'}
                </button>
                <button
                    onClick={() => onRemoveOperation(operation.id)}
                    className="text-slate-500 hover:text-red-400 transition cursor-pointer text-sm"
                    title="Remove"
                >
                    🗑
                </button>
            </div>

            {/* Preview hint badge */}
            {plugin.previewHint === 'none' && (
                <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-600/10 border border-amber-600/20 flex items-center gap-2">
                    <span className="text-sm">⚡</span>
                    <span className="text-[10px] text-amber-400">Applied at render time — no canvas preview</span>
                </div>
            )}

            {/* Fields */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {visibleFields.map(field => (
                    <FieldRenderer
                        key={field.key}
                        field={field}
                        value={operation.params[field.key] ?? field.default}
                        onChange={(val) => updateParam(field.key, val)}
                    />
                ))}
            </div>
        </div>
    )
}

// ── Field Renderer ─────────────────────────────────────

function FieldRenderer({
    field,
    value,
    onChange,
}: {
    field: PluginConfigField
    value: any
    onChange: (val: any) => void
}) {
    const { type, label, description, min, max, step, unit, options, placeholder } = field

    const labelEl = (
        <label className="text-[11px] font-medium text-slate-400 mb-1 block">
            {label}
            {unit && <span className="text-slate-600 ml-1">({unit})</span>}
        </label>
    )

    switch (type) {
        case 'slider':
            return (
                <div>
                    {labelEl}
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min={min ?? 0}
                            max={max ?? 100}
                            step={step ?? 1}
                            value={value ?? min ?? 0}
                            onChange={(e) => onChange(Number(e.target.value))}
                            className="flex-1 h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-purple-500"
                        />
                        <span className="text-xs text-slate-300 font-mono w-10 text-right">
                            {typeof value === 'number' ? value : min ?? 0}
                        </span>
                    </div>
                    {description && <p className="text-[9px] text-slate-600 mt-0.5">{description}</p>}
                </div>
            )

        case 'number':
            return (
                <div>
                    {labelEl}
                    <input
                        type="number"
                        value={value ?? ''}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500 transition"
                        placeholder={placeholder}
                    />
                </div>
            )

        case 'string':
            return (
                <div>
                    {labelEl}
                    <input
                        type="text"
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500 transition"
                        placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
                    />
                </div>
            )

        case 'select':
            return (
                <div>
                    {labelEl}
                    <select
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500 transition cursor-pointer"
                    >
                        {options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.icon ? `${opt.icon} ` : ''}{opt.label}</option>
                        ))}
                    </select>
                </div>
            )

        case 'boolean':
            return (
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400">{label}</span>
                    <button
                        onClick={() => onChange(!value)}
                        className={`w-9 h-5 rounded-full transition cursor-pointer relative ${value ? 'bg-purple-600' : 'bg-slate-700'
                            }`}
                    >
                        <div
                            className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${value ? 'left-[18px]' : 'left-1'
                                }`}
                        />
                    </button>
                </div>
            )

        case 'color':
            return (
                <div>
                    {labelEl}
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={value || '#ffffff'}
                            onChange={(e) => onChange(e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-slate-700 bg-slate-800"
                        />
                        <span className="text-xs font-mono text-slate-400">{value || '#ffffff'}</span>
                    </div>
                </div>
            )

        case 'position':
            return (
                <div>
                    {labelEl}
                    <PositionPicker value={value} onChange={onChange} />
                </div>
            )

        case 'asset':
            return (
                <div>
                    {labelEl}
                    <button
                        onClick={async () => {
                            try {
                                // @ts-ignore
                                const result = await window.api?.invoke?.('dialog:open-file', {
                                    filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav'] }]
                                })
                                if (result) onChange(result)
                            } catch { }
                        }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 border-dashed rounded-lg text-xs text-slate-400 hover:border-purple-500 hover:text-purple-300 transition cursor-pointer text-center"
                    >
                        {value ? '✅ File selected' : '📎 Choose file...'}
                    </button>
                    {description && <p className="text-[9px] text-slate-600 mt-0.5">{description}</p>}
                </div>
            )

        case 'timeRange':
            return (
                <div>
                    {labelEl}
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={value?.start ?? ''}
                            min={0}
                            step={0.1}
                            onChange={(e) => onChange({ ...value, start: e.target.value === '' ? undefined : Number(e.target.value) })}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none focus:border-purple-500"
                            placeholder="Start"
                        />
                        <span className="text-slate-600 text-xs">→</span>
                        <input
                            type="number"
                            value={value?.end ?? ''}
                            min={0}
                            step={0.1}
                            onChange={(e) => onChange({ ...value, end: e.target.value === '' ? undefined : Number(e.target.value) })}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none focus:border-purple-500"
                            placeholder="End"
                        />
                    </div>
                    {description && <p className="text-[9px] text-slate-600 mt-0.5">{description}</p>}
                </div>
            )

        default:
            return (
                <div>
                    {labelEl}
                    <div className="text-[10px] text-slate-600 italic">
                        Unsupported field type: {type}
                    </div>
                </div>
            )
    }
}

// ── 9-Point Position Picker ───────────────────────────

function PositionPicker({
    value,
    onChange,
}: {
    value: string | { x: number; y: number }
    onChange: (val: string) => void
}) {
    const positions = [
        'top-left', 'top-center', 'top-right',
        'center-left', 'center', 'center-right',
        'bottom-left', 'bottom-center', 'bottom-right',
    ]
    const currentPos = typeof value === 'string' ? value : 'center'

    return (
        <div className="grid grid-cols-3 gap-1 w-24">
            {positions.map(pos => (
                <button
                    key={pos}
                    onClick={() => onChange(pos)}
                    className={`w-7 h-7 rounded-md transition cursor-pointer border ${currentPos === pos
                            ? 'bg-purple-600 border-purple-400 shadow-sm'
                            : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                        }`}
                    title={pos}
                >
                    <div className={`w-1.5 h-1.5 rounded-full mx-auto ${currentPos === pos ? 'bg-white' : 'bg-slate-600'
                        }`} />
                </button>
            ))}
        </div>
    )
}

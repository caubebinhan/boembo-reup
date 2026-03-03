/**
 * EditorProperties — Right panel (Vintage Pastel Light Theme)
 * Uses shared types from ./types
 */
import { useMemo, useState } from 'react'
import type { PluginConfigField, PluginMeta, VideoEditOperation } from './types'
import { V } from './types'

interface EditorPropertiesProps {
    operation: VideoEditOperation | null
    plugin: PluginMeta | null
    onUpdateParams: (opId: string, params: Record<string, any>) => void
    onToggleEnabled: (opId: string) => void
    onRemoveOperation: (opId: string) => void
}

export function EditorProperties({ operation, plugin, onUpdateParams, onToggleEnabled, onRemoveOperation }: EditorPropertiesProps) {
    if (!operation || !plugin) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12" style={{ background: V.bg }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-2xl"
                    style={{ background: V.accentSoft }}>🎛️</div>
                <p className="text-sm font-semibold" style={{ color: V.textMuted }}>Nothing selected</p>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: V.textDim }}>
                    Click a track on the timeline<br />or an overlay on the canvas
                </p>
            </div>
        )
    }

    const isVisual = plugin.previewHint !== 'none'
    const visibleFields = useMemo(() => plugin.configSchema.filter(f => !f.condition || operation.params[f.condition.field] === f.condition.value), [plugin.configSchema, operation.params])
    const panelFields = visibleFields.filter(f => !['position'].includes(f.type))
    const updateParam = (key: string, value: any) => onUpdateParams(operation.id, { ...operation.params, [key]: value })

    return (
        <div className="flex flex-col h-full" style={{ background: V.bg }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${V.beige}` }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: V.accentSoft }}>{plugin.icon}</div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate" style={{ color: V.charcoal }}>{plugin.name}</h3>
                    <p className="text-[10px] tracking-wide uppercase font-medium" style={{ color: V.textDim }}>{plugin.group}</p>
                </div>
                <button onClick={() => onToggleEnabled(operation.id)}
                    aria-label={operation.enabled ? 'Disable operation' : 'Enable operation'}
                    aria-pressed={operation.enabled}
                    className="relative shrink-0 cursor-pointer" style={{ width: 36, height: 20 }}>
                    <div className="absolute inset-0 rounded-full transition-all"
                        style={{ background: operation.enabled ? V.accent : V.beige }} />
                    <div className="absolute top-1 w-3.5 h-3.5 rounded-full shadow transition-all"
                        style={{ left: operation.enabled ? 18 : 4, background: operation.enabled ? '#fff' : V.textDim }} />
                </button>
                <button onClick={() => onRemoveOperation(operation.id)}
                    aria-label="Remove operation"
                    className="transition cursor-pointer shrink-0 p-1 rounded text-sm" title="Remove"
                    style={{ color: V.textDim }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2' }}
                    onMouseLeave={e => { e.currentTarget.style.color = V.textDim; e.currentTarget.style.background = 'transparent' }}>🗑</button>
            </div>

            {isVisual && (
                <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5"
                    style={{ background: V.accentSoft, border: `1px solid ${V.accent}22` }}>
                    <span className="text-base">✋</span>
                    <div>
                        <p className="text-[11px] font-semibold" style={{ color: V.accent }}>Drag on canvas</p>
                        <p className="text-[10px] mt-0.5" style={{ color: `${V.accent}88` }}>Resize corners · Drag to move</p>
                    </div>
                </div>
            )}
            {!isVisual && (
                <div className="mx-3 mt-3 px-3 py-2 rounded-xl flex items-center gap-2"
                    style={{ background: V.pastelPeach, border: '1px solid #e0b89644' }}>
                    <span className="text-sm">⚡</span>
                    <p className="text-[10px]" style={{ color: '#8e5a2b' }}>Applied at render — no preview</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                {panelFields.map(field => (
                    <FieldRenderer key={field.key} field={field}
                        value={operation.params[field.key] ?? field.default}
                        onChange={val => updateParam(field.key, val)} />
                ))}
                {panelFields.length === 0 && (
                    <p className="text-center text-xs py-6" style={{ color: V.textDim }}>No additional options</p>
                )}
            </div>
        </div>
    )
}

function FieldRenderer({ field, value, onChange }: { field: PluginConfigField; value: any; onChange: (v: any) => void }) {
    const { type, label, description, min, max, step, unit, options, placeholder } = field
    const labelEl = (
        <label className="text-[10px] font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: V.textDim }}>
            {label}{unit && <span className="ml-1 normal-case font-normal" style={{ color: V.textDim }}>({unit})</span>}
        </label>
    )

    switch (type) {
        case 'select':
            return (
                <div>{labelEl}
                    <div className="flex flex-wrap gap-1.5">
                        {options?.map(opt => {
                            const isActive = value === opt.value || (!value && field.default === opt.value)
                            return (
                                <button key={opt.value} onClick={() => onChange(opt.value)}
                                    aria-pressed={isActive}
                                    aria-label={`${label}: ${opt.label}`}
                                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer"
                                    style={{
                                        background: isActive ? V.accentSoft : V.cream,
                                        color: isActive ? V.accent : V.textDim,
                                        border: `1px solid ${isActive ? `${V.accent}44` : V.beige}`,
                                    }}>
                                    {opt.icon && <span className="mr-1">{opt.icon}</span>}{opt.label}
                                </button>
                            )
                        })}
                    </div>
                    {description && <p className="text-[10px] mt-1" style={{ color: V.textDim }}>{description}</p>}
                </div>
            )
        case 'slider':
            return (
                <div>{labelEl}
                    <div className="flex items-center gap-2.5">
                        <div className="flex-1 relative h-5 flex items-center">
                            <div className="absolute w-full h-1.5 rounded-full" style={{ background: V.beige }}>
                                <div className="h-full rounded-full" style={{
                                    width: `${(((value ?? min ?? 0) - (min ?? 0)) / ((max ?? 100) - (min ?? 0))) * 100}%`,
                                    background: V.accent,
                                }} />
                            </div>
                            <input type="range" min={min ?? 0} max={max ?? 100} step={step ?? 1}
                                aria-label={label}
                                value={value ?? min ?? 0} onChange={e => onChange(Number(e.target.value))}
                                className="absolute w-full opacity-0 cursor-pointer h-full" />
                        </div>
                        <div className="text-[11px] font-mono font-bold w-10 text-right shrink-0" style={{ color: V.accent }}>
                            {typeof value === 'number' ? value : (min ?? 0)}
                        </div>
                    </div>
                    {description && <p className="text-[10px] mt-1" style={{ color: V.textDim }}>{description}</p>}
                </div>
            )
        case 'number':
            if (min !== undefined && max !== undefined) return <FieldRenderer field={{ ...field, type: 'slider' }} value={value} onChange={onChange} />
            return (
                <div>{labelEl}
                    <input type="number" value={value ?? ''} min={min} max={max} step={step}
                        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg text-xs outline-none transition"
                        style={{ background: V.cream, border: `1px solid ${V.beige}`, color: V.charcoal }} placeholder={placeholder} />
                </div>
            )
        case 'string':
            return (
                <div>{labelEl}
                    <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg text-xs outline-none transition"
                        style={{ background: V.cream, border: `1px solid ${V.beige}`, color: V.charcoal }}
                        placeholder={placeholder || `Enter ${label.toLowerCase()}...`} />
                </div>
            )
        case 'boolean':
            return (
                <div className="flex items-center justify-between py-0.5">
                    <span className="text-[11px] font-medium" style={{ color: V.textMuted }}>{label}</span>
                    <button onClick={() => onChange(!value)} aria-label={label} aria-pressed={Boolean(value)} className="relative transition-all cursor-pointer shrink-0" style={{ width: 34, height: 18 }}>
                        <div className="absolute inset-0 rounded-full transition-all" style={{ background: value ? V.accent : V.beige }} />
                        <div className="absolute top-0.5 w-3.5 h-3.5 rounded-full shadow transition-all"
                            style={{ left: value ? 17 : 2, background: value ? '#fff' : V.textDim }} />
                    </button>
                </div>
            )
        case 'color':
            return (
                <div>{labelEl}
                    <div className="flex items-center gap-2.5">
                        <input type="color" value={value || '#2c2a29'} onChange={e => onChange(e.target.value)}
                            className="w-9 h-9 rounded-lg cursor-pointer" style={{ border: `2px solid ${V.beige}`, background: 'transparent' }} />
                        <span className="text-xs font-mono" style={{ color: V.textDim }}>{value || '#2c2a29'}</span>
                    </div>
                </div>
            )
        case 'position':
            return <div>{labelEl}<PositionPicker value={value} onChange={onChange} /></div>

        // ── Region selector (x, y, w, h) ──
        case 'region':
            return <div>{labelEl}<RegionEditor value={value} onChange={onChange} /></div>

        // ── Aspect ratio preset buttons ──
        case 'aspectRatio':
            return <div>{labelEl}<AspectRatioPicker value={value} onChange={onChange} /></div>

        case 'asset':
            return (
                <div>{labelEl}
                    <button onClick={async () => {
                        try {
                            // @ts-ignore
                            const r = await window.api?.invoke?.('dialog:open-file', { filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav'] }] })
                            if (r) onChange(r)
                        } catch { }
                    }} aria-label={value ? 'Replace selected media file' : 'Choose media file'} className="w-full py-2.5 rounded-lg text-xs font-medium transition cursor-pointer text-center"
                        style={{ background: V.cream, border: `1px dashed ${V.beige}`, color: value ? V.accent : V.textDim }}>
                        {value ? '✅ File selected' : '📎 Choose file...'}
                    </button>
                    {description && <p className="text-[10px] mt-1" style={{ color: V.textDim }}>{description}</p>}
                </div>
            )
        case 'timeRange':
            return (
                <div>{labelEl}
                    <div className="flex items-center gap-2">
                        <input type="number" value={value?.start ?? ''} min={0} step={0.1}
                            aria-label={`${label} start time`}
                            onChange={e => onChange({ ...value, start: e.target.value === '' ? undefined : Number(e.target.value) })}
                            className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
                            style={{ background: V.cream, border: `1px solid ${V.beige}`, color: V.charcoal }} placeholder="Start" />
                        <span className="text-xs" style={{ color: V.textDim }}>→</span>
                        <input type="number" value={value?.end ?? ''} min={0} step={0.1}
                            aria-label={`${label} end time`}
                            onChange={e => onChange({ ...value, end: e.target.value === '' ? undefined : Number(e.target.value) })}
                            className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
                            style={{ background: V.cream, border: `1px solid ${V.beige}`, color: V.charcoal }} placeholder="End" />
                    </div>
                    {description && <p className="text-[10px] mt-1" style={{ color: V.textDim }}>{description}</p>}
                </div>
            )
        default:
            return <div>{labelEl}<div className="text-[10px] italic" style={{ color: V.textDim }}>Unsupported: {type}</div></div>
    }
}

// ── Position Picker (9-point grid) ──

function PositionPicker({ value, onChange }: { value: string | { x: number; y: number }; onChange: (v: string) => void }) {
    const positions = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']
    const cur = typeof value === 'string' ? value : 'center'
    return (
        <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl" style={{ width: 96, background: V.cream, border: `1px solid ${V.beige}` }}>
            {positions.map(pos => (
                <button key={pos} onClick={() => onChange(pos)}
                    aria-label={`Set position ${pos}`}
                    aria-pressed={cur === pos}
                    className="w-7 h-7 rounded-md transition-all cursor-pointer flex items-center justify-center"
                    style={{ background: cur === pos ? V.accentSoft : V.card, border: `1px solid ${cur === pos ? `${V.accent}44` : V.beige}` }} title={pos}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: cur === pos ? V.accent : V.textDim }} />
                </button>
            ))}
        </div>
    )
}

// ── Region Editor (x, y, w, h inputs) ──

function RegionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const region = value || { x: 0, y: 0, w: 100, h: 100 }
    const update = (key: string, v: number) => onChange({ ...region, [key]: v })

    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map(key => (
                    <div key={key} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase w-4 text-right" style={{ color: V.textDim }}>{key}</span>
                        <input type="number" value={region[key] ?? 0} min={0}
                            aria-label={`Region ${key}`}
                            onChange={e => update(key, Number(e.target.value))}
                            className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
                            style={{ background: V.cream, border: `1px solid ${V.beige}`, color: V.charcoal }} />
                    </div>
                ))}
            </div>
            <p className="text-[10px]" style={{ color: V.textDim }}>
                Drag on the canvas preview to select region visually
            </p>
        </div>
    )
}

// ── Aspect Ratio Picker ──

const RATIOS = [
    { value: '9:16', label: '9:16', icon: '📱', desc: 'Portrait' },
    { value: '16:9', label: '16:9', icon: '🖥️', desc: 'Landscape' },
    { value: '1:1', label: '1:1', icon: '⬛', desc: 'Square' },
    { value: '4:3', label: '4:3', icon: '📺', desc: 'Classic' },
    { value: '4:5', label: '4:5', icon: '📸', desc: 'Instagram' },
]

function AspectRatioPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [customOpen, setCustomOpen] = useState(false)
    const current = value || '9:16'
    const isCustom = !RATIOS.find(r => r.value === current)

    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-5 gap-1.5">
                {RATIOS.map(r => {
                    const active = current === r.value
                    return (
                        <button key={r.value} onClick={() => { onChange(r.value); setCustomOpen(false) }}
                            aria-label={`Set aspect ratio ${r.value}`}
                            aria-pressed={active}
                            className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all cursor-pointer"
                            style={{
                                background: active ? V.accentSoft : V.cream,
                                border: `1px solid ${active ? `${V.accent}44` : V.beige}`,
                            }}>
                            <span className="text-sm">{r.icon}</span>
                            <span className="text-[10px] font-bold" style={{ color: active ? V.accent : V.textDim }}>{r.label}</span>
                        </button>
                    )
                })}
            </div>
            <button onClick={() => setCustomOpen(!customOpen)}
                aria-label={customOpen ? 'Hide custom aspect ratio input' : 'Show custom aspect ratio input'}
                className="text-[10px] font-medium px-2 py-1 rounded-lg cursor-pointer transition"
                style={{ color: isCustom ? V.accent : V.textDim, background: isCustom ? V.accentSoft : 'transparent' }}>
                {isCustom ? `Custom: ${current}` : '+ Custom ratio'}
            </button>
            {customOpen && (
                <input type="text" value={isCustom ? current : ''} placeholder="e.g. 3:4"
                    aria-label="Custom aspect ratio"
                    onChange={e => { if (e.target.value.match(/^\d+:\d+$/)) onChange(e.target.value) }}
                    className="px-2 py-1 rounded-lg text-xs outline-none"
                    style={{ background: V.cream, border: `1px solid ${V.beige}`, color: V.charcoal }} />
            )}
        </div>
    )
}

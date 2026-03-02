/**
 * EditorToolbar — Vintage Pastel vertical icon sidebar
 */
import { useState, useRef, useEffect } from 'react'

interface PluginMeta {
    id: string; name: string; group: string; icon: string
    description: string; previewHint: string; allowMultipleInstances?: boolean
}

interface EditorToolbarProps {
    plugins: PluginMeta[]
    onAddOperation: (pluginId: string) => void
}

const GROUPS: { id: string; emoji: string; label: string }[] = [
    { id: 'overlay', emoji: '🖼️', label: 'Overlay' },
    { id: 'transform', emoji: '📐', label: 'Transform' },
    { id: 'filter', emoji: '✨', label: 'Effects' },
    { id: 'audio', emoji: '🔊', label: 'Audio' },
    { id: 'anti-detect', emoji: '🛡️', label: 'Protect' },
]

const V = {
    bg: '#fcfbf8', cream: '#f5f3ee', beige: '#e8e4db', card: '#ffffff',
    charcoal: '#2c2a29', textDim: '#8a827c', accent: '#7c3aed',
    accentSoft: '#f3effe', pastelMint: '#d4e8d8',
}

export function EditorToolbar({ plugins, onAddOperation }: EditorToolbarProps) {
    const [openGroup, setOpenGroup] = useState<string | null>(null)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpenGroup(null) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    return (
        <div ref={ref} className="flex flex-col items-center py-3 gap-1 shrink-0 relative"
            style={{ width: 72, background: V.card, borderRight: `1px solid ${V.beige}` }}>
            <div className="flex flex-col gap-1 w-full px-2">
                {GROUPS.map(group => {
                    const gp = plugins.filter(p => p.group === group.id)
                    if (gp.length === 0) return null
                    const isOpen = openGroup === group.id
                    return (
                        <div key={group.id} className="relative">
                            <button onClick={() => setOpenGroup(isOpen ? null : group.id)}
                                className="w-full flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl transition-all cursor-pointer"
                                style={{
                                    background: isOpen ? V.accentSoft : 'transparent',
                                    color: isOpen ? V.accent : V.textDim,
                                }}
                                onMouseEnter={e => { if (!isOpen) { e.currentTarget.style.background = V.cream; e.currentTarget.style.color = V.charcoal } }}
                                onMouseLeave={e => { if (!isOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = V.textDim } }}
                                title={group.label}>
                                <span className="text-xl">{group.emoji}</span>
                                <span className="text-[9px] font-medium">{group.label}</span>
                            </button>
                            {isOpen && (
                                <div className="absolute left-full top-0 ml-2 flex flex-col overflow-hidden z-50"
                                    style={{ width: 230, background: V.card, border: `1px solid ${V.beige}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(44,42,41,0.12)' }}>
                                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${V.beige}` }}>
                                        <span className="text-base">{group.emoji}</span>
                                        <span className="text-xs font-bold tracking-wide uppercase" style={{ color: V.charcoal }}>{group.label}</span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto"
                                            style={{ background: V.accentSoft, color: V.accent }}>{gp.length}</span>
                                    </div>
                                    <div className="py-1">
                                        {gp.map(plugin => (
                                            <button key={plugin.id}
                                                onClick={() => { onAddOperation(plugin.id); setOpenGroup(null) }}
                                                className="w-full px-3 py-2 flex items-center gap-2.5 transition-all text-left cursor-pointer"
                                                onMouseEnter={e => (e.currentTarget.style.background = V.accentSoft)}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <span className="text-lg shrink-0">{plugin.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-semibold truncate" style={{ color: V.charcoal }}>{plugin.name}</div>
                                                    <div className="text-[9px] truncate mt-0.5" style={{ color: V.textDim }}>{plugin.description}</div>
                                                </div>
                                                {plugin.previewHint !== 'none' ? (
                                                    <span className="text-[8px] px-1 py-0.5 rounded-full shrink-0 font-bold"
                                                        style={{ background: V.pastelMint, color: '#2e7d32' }}>LIVE</span>
                                                ) : (
                                                    <span className="text-[8px] px-1 py-0.5 rounded-full shrink-0 font-bold"
                                                        style={{ background: '#fef3c7', color: '#92400e' }}>AUTO</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            <div className="flex-1" />
            <div className="w-8 h-px" style={{ background: V.beige }} />
            <button className="w-full flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg transition cursor-pointer mt-1"
                title="Settings" style={{ color: V.textDim }}
                onMouseEnter={e => { e.currentTarget.style.color = V.charcoal; e.currentTarget.style.background = V.cream }}
                onMouseLeave={e => { e.currentTarget.style.color = V.textDim; e.currentTarget.style.background = 'transparent' }}>
                <span className="text-lg">⚙️</span>
                <span className="text-[9px] font-medium">Settings</span>
            </button>
        </div>
    )
}

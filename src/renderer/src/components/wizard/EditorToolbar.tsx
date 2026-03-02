/**
 * EditorToolbar — Vertical icon sidebar (CapCut-style)
 * ────────────────────────────────────────────────────
 * Groups plugins by category. Click to add an operation.
 * Shows a dropdown with available plugins in that group.
 */
import { useState, useRef, useEffect } from 'react'

interface PluginMeta {
    id: string
    name: string
    group: string
    icon: string
    description: string
    previewHint: string
    allowMultipleInstances?: boolean
}

interface EditorToolbarProps {
    plugins: PluginMeta[]
    onAddOperation: (pluginId: string) => void
}

// Group icons & labels
const GROUPS: { id: string; icon: string; label: string }[] = [
    { id: 'overlay', icon: '🏷️', label: 'Overlay' },
    { id: 'transform', icon: '🔄', label: 'Transform' },
    { id: 'filter', icon: '🎨', label: 'Filter' },
    { id: 'audio', icon: '🎵', label: 'Audio' },
    { id: 'anti-detect', icon: '🛡️', label: 'Anti-Detect' },
]

export function EditorToolbar({ plugins, onAddOperation }: EditorToolbarProps) {
    const [openGroup, setOpenGroup] = useState<string | null>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenGroup(null)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    return (
        <div className="w-12 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-3 gap-1 shrink-0 relative" ref={dropdownRef}>
            {GROUPS.map(group => {
                const groupPlugins = plugins.filter(p => p.group === group.id)
                if (groupPlugins.length === 0) return null
                const isOpen = openGroup === group.id

                return (
                    <div key={group.id} className="relative">
                        <button
                            onClick={() => setOpenGroup(isOpen ? null : group.id)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition cursor-pointer ${isOpen
                                    ? 'bg-purple-600 shadow-lg shadow-purple-500/30'
                                    : 'hover:bg-slate-700 text-slate-400 hover:text-white'
                                }`}
                            title={group.label}
                        >
                            {group.icon}
                        </button>

                        {/* Dropdown */}
                        {isOpen && (
                            <div className="absolute left-full top-0 ml-2 w-56 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                                <div className="px-3 py-2 border-b border-slate-700">
                                    <span className="text-xs font-bold text-slate-300">{group.label}</span>
                                </div>
                                {groupPlugins.map(plugin => (
                                    <button
                                        key={plugin.id}
                                        onClick={() => {
                                            onAddOperation(plugin.id)
                                            setOpenGroup(null)
                                        }}
                                        className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-700 transition text-left cursor-pointer"
                                    >
                                        <span className="text-base shrink-0">{plugin.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-slate-200 truncate">{plugin.name}</div>
                                            <div className="text-[10px] text-slate-500 truncate">{plugin.description}</div>
                                        </div>
                                        {plugin.previewHint !== 'none' && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300 shrink-0">
                                                Preview
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Divider */}
            <div className="w-6 h-px bg-slate-700 my-1" />

            {/* Settings icon */}
            <button
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition cursor-pointer"
                title="Settings"
            >
                ⚙️
            </button>
        </div>
    )
}

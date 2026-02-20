import { useMemo } from 'react'

interface Source {
    name: string
    autoSchedule: boolean
}

interface Step4Props {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

export function Step4_Schedule({ data, updateData }: Step4Props) {
    const sources: Source[] = data.sources || []

    // Calculate preview timeline items
    const timelineItems = useMemo(() => {
        if (!data.firstRunAt || sources.length === 0) return []

        let t = new Date(data.firstRunAt).getTime()
        const intervalMs = (data.intervalMinutes || 60) * 60000

        // Simple preview logic: Just generate a mocked sequence of scan items based on schedule
        const items: any[] = []
        let seq = 1

        for (const source of sources) {
            items.push({
                id: seq.toString(),
                time: new Date(t).toISOString().slice(0, 16).replace('T', ' '),
                type: 'Scan Source',
                sourceName: source.name,
                seq: seq++
            })
            t += intervalMs
        }

        return items
    }, [data.firstRunAt, data.intervalMinutes, sources])

    const toggleSourceAutoSchedule = (index: number) => {
        const newSources = [...sources]
        newSources[index].autoSchedule = !newSources[index].autoSchedule
        updateData({ sources: newSources })
    }

    return (
        <div className="flex flex-col gap-6 text-white max-w-4xl mx-auto pb-10">

            {/* SECTION 1: Config summary bar */}
            <div className="grid grid-cols-3 gap-4 bg-[#111827] border border-gray-700 p-4 rounded-xl">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-400">Campaign Start Time</label>
                    <input
                        type="datetime-local"
                        value={data.firstRunAt || ''}
                        onChange={(e) => updateData({ firstRunAt: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded p-2 outline-none text-sm"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-400">Gap between actions</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={data.intervalMinutes || 60}
                            onChange={(e) => updateData({ intervalMinutes: Number(e.target.value) })}
                            className="bg-gray-800 border border-gray-700 rounded p-2 w-20 outline-none text-sm"
                        />
                        <span className="text-sm text-gray-500">minutes</span>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-400">Daily Window</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="time"
                            value={data.activeHoursStart || '09:00'}
                            onChange={(e) => updateData({ activeHoursStart: e.target.value })}
                            className="bg-gray-800 border border-gray-700 rounded p-2 outline-none text-sm"
                        />
                        <span className="text-gray-500">-</span>
                        <input
                            type="time"
                            value={data.activeHoursEnd || '21:00'}
                            onChange={(e) => updateData({ activeHoursEnd: e.target.value })}
                            className="bg-gray-800 border border-gray-700 rounded p-2 outline-none text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* SECTION 2: Info bar */}
            <div className="flex justify-between items-center bg-purple-900/40 border border-purple-500/30 p-4 rounded-lg">
                <div className="flex flex-col">
                    <span className="text-xs text-purple-300 font-bold">First Scan</span>
                    <span className="text-sm font-medium">{data.firstRunAt ? new Date(data.firstRunAt).toLocaleString() : 'Not Set'}</span>
                </div>
                <div className="flex flex-col border-l border-purple-500/30 pl-4">
                    <span className="text-xs text-purple-300 font-bold">First Upload</span>
                    <span className="text-sm font-medium text-gray-400">TBD (After Scan)</span>
                </div>
                <div className="flex flex-col border-l border-purple-500/30 pl-4">
                    <span className="text-xs text-purple-300 font-bold">Total Items</span>
                    <span className="text-sm font-medium text-green-400">{sources.length} actions</span>
                </div>
            </div>

            {/* SECTION 3: Source Verification Options */}
            {sources.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-gray-400 tracking-wider">SOURCE VERIFICATION OPTIONS</h3>
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
                        {sources.map((source, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 border-b border-gray-700/50 last:border-0 hover:bg-gray-800 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500/50 to-indigo-600/50 flex flex-shrink-0 items-center justify-center text-xs">📡</div>
                                    <span className="font-medium text-sm">{source.name}</span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-xs text-gray-400">Auto-schedule</span>
                                    <input
                                        type="checkbox"
                                        checked={!!source.autoSchedule}
                                        onChange={() => toggleSourceAutoSchedule(idx)}
                                        className="w-4 h-4 accent-purple-600"
                                    />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SECTION 4: Schedule Timeline Preview */}
            <div className="flex flex-col gap-2 mt-4">
                <h3 className="text-sm font-bold text-gray-400 tracking-wider">SCHEDULE PREVIEW</h3>

                {timelineItems.length === 0 ? (
                    <div className="text-gray-500 italic p-4 text-center border border-gray-800 rounded-lg">
                        No items to preview. Add sources and set schedule.
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 relative pl-4">
                        {/* Vertical timeline line */}
                        <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gray-700 z-0"></div>

                        {timelineItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-4 relative z-10 group">
                                {/* Drag handle */}
                                <div className="text-gray-600 cursor-grab hover:text-white">⠿</div>

                                {/* Timeline node */}
                                <div className="w-3 h-3 rounded-full bg-purple-500 ring-4 ring-[#0f172a]"></div>

                                {/* Card */}
                                <div className="flex-1 flex items-center justify-between bg-[#1e293b] border border-gray-700 p-3 rounded-lg group-hover:border-gray-500 transition">
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-400 text-sm font-mono bg-black/30 px-2 py-1 rounded">[{item.time}]</span>

                                        <div className="flex items-center gap-2">
                                            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                                                📺 {item.type}
                                            </span>
                                            <span className="font-medium">{item.sourceName}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-gray-500 font-mono">Seq#{item.seq}</span>
                                        <button className="text-gray-600 hover:text-red-400 transition" title="Remove instance">🗑</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    )
}

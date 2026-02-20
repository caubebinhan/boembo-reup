import { useEffect } from 'react'
interface Source {
    type: 'channel' | 'keyword'
    name: string
    avatar?: string
    historyLimit: number
    sortOrder: 'newest' | 'oldest' | 'most_liked' | 'most_viewed'
    timeRange: 'history_only' | 'future_only' | 'history_and_future' | 'custom_range'
    startDate?: string
    endDate?: string
    autoSchedule: boolean
}

interface Step2Props {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

export function Step2_Sources({ data, updateData }: Step2Props) {
    const sources: Source[] = data.sources || []

    const updateSource = (index: number, updates: Partial<Source>) => {
        const newSources = [...sources]
        newSources[index] = { ...newSources[index], ...updates }
        updateData({ sources: newSources })
    }

    const removeSource = (index: number) => {
        updateData({ sources: sources.filter((_, i) => i !== index) })
    }

    useEffect(() => {
        // @ts-ignore
        const off = window.api.on('scanner:import', (sourceConfig) => {
            // Append the new source
            updateData({ sources: [...sources, sourceConfig] })
        })
        return () => {
            if (typeof off === 'function') off()
        }
    }, [sources, updateData])

    const handleScanClick = async () => {
        // Open ScannerTool Window via IPC
        try {
            // @ts-ignore
            await window.api.invoke('open-scanner-window')
            // Note: In real implementation, we would wait for 'scanner:import' IPC event
            // to receive the scanned sources and add them to the list.
            // E.g., receiving [{ name: '@vtv24news', type: 'channel' }]
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="flex flex-col gap-6 text-white max-w-4xl mx-auto pb-10">

            {/* HEADER */}
            <div className="flex justify-between items-center bg-gray-900 border border-gray-800 p-6 rounded-xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col gap-1">
                    <h2 className="text-2xl font-bold">Step 2: Content Sources</h2>
                    <p className="text-gray-400">Configure channels & keywords to monitor.</p>
                </div>

                {sources.length > 0 && (
                    <div className="relative z-10 flex items-center gap-4">
                        <span className="text-sm font-bold text-gray-500">SOURCES ({sources.length})</span>
                        <button
                            onClick={handleScanClick}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
                        >
                            <span>🔍</span> Scan Sources
                        </button>
                    </div>
                )}

                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-purple-900/20 to-transparent pointer-events-none"></div>
            </div>

            {/* EMPTY STATE */}
            {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 border-2 border-dashed border-gray-700 rounded-xl bg-gray-800/50">
                    <div className="text-5xl mb-4">📡</div>
                    <h3 className="text-xl font-bold mb-2">No Sources Configured</h3>
                    <p className="text-gray-400 mb-8 text-center max-w-md">
                        Add channels or keywords to automatically find and process content for this campaign.
                    </p>
                    <button
                        onClick={handleScanClick}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold text-lg transition shadow-lg shadow-purple-900/20"
                    >
                        🔍 Scan & Add Sources
                    </button>
                </div>
            ) : (
                /* LIST STATE */
                <div className="flex flex-col gap-4">
                    {sources.map((source, index) => (
                        <div key={index} className="bg-[#111827] border border-gray-700 rounded-xl overflow-hidden shadow-lg">

                            {/* Card Header */}
                            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                                        {source.avatar ? <img src={source.avatar} className="w-full h-full rounded-full" /> : source.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="font-bold text-lg">{source.name}</span>
                                </div>
                                <button
                                    onClick={() => removeSource(index)}
                                    className="text-gray-500 hover:text-red-400 hover:bg-red-900/20 p-2 rounded transition"
                                    title="Remove Source"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Card Body */}
                            <div className="p-5 grid grid-cols-2 gap-6">

                                {/* SCAN LIMIT */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                                        <span>🎯</span> SCAN LIMIT
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min="1" max="9999"
                                            value={source.historyLimit}
                                            onChange={(e) => updateSource(index, { historyLimit: Number(e.target.value) })}
                                            className="bg-gray-800 border border-gray-700 focus:border-purple-600 rounded-lg p-2 w-24 outline-none font-medium"
                                        />
                                        <span className="text-gray-500">videos</span>
                                    </div>
                                </div>

                                {/* SORTING */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                                        <span>🎲</span> SORTING
                                    </label>
                                    <select
                                        value={source.sortOrder}
                                        onChange={(e) => updateSource(index, { sortOrder: e.target.value as any })}
                                        className="bg-gray-800 border border-gray-700 focus:border-purple-600 rounded-lg p-2 outline-none font-medium text-white appearance-none"
                                    >
                                        <option value="newest">Newest</option>
                                        <option value="oldest">Oldest</option>
                                        <option value="most_liked">Most Liked</option>
                                        <option value="most_viewed">Most Viewed</option>
                                    </select>
                                </div>

                                {/* TIME RANGE */}
                                <div className="flex flex-col gap-2 col-span-2 border-t border-gray-800 pt-5 mt-1">
                                    <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                                        <span>📅</span> TIME RANGE
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select
                                            value={source.timeRange}
                                            onChange={(e) => updateSource(index, { timeRange: e.target.value as any })}
                                            className="bg-gray-800 border border-gray-700 focus:border-purple-600 rounded-lg p-2 outline-none font-medium text-white max-w-sm"
                                        >
                                            <option value="history_only">History Only</option>
                                            <option value="future_only">Future Only (Monitor)</option>
                                            <option value="history_and_future">History & Future (Both)</option>
                                            <option value="custom_range">Custom Range</option>
                                        </select>

                                        {source.timeRange === 'custom_range' && (
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="date"
                                                    value={source.startDate || ''}
                                                    onChange={(e) => updateSource(index, { startDate: e.target.value })}
                                                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 outline-none"
                                                />
                                                <span className="text-gray-500">-</span>
                                                <input
                                                    type="date"
                                                    value={source.endDate || ''}
                                                    onChange={(e) => updateSource(index, { endDate: e.target.value })}
                                                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 outline-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* AUTO SCHEDULE */}
                                <div className="col-span-2 pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={source.autoSchedule}
                                            onChange={(e) => updateSource(index, { autoSchedule: e.target.checked })}
                                            className="w-5 h-5 accent-purple-600"
                                        />
                                        <div>
                                            <div className="font-semibold group-hover:text-purple-400 transition">Auto-schedule videos</div>
                                            <div className="text-sm text-gray-500">If off, you must manually approve videos from this source.</div>
                                        </div>
                                    </label>
                                </div>

                            </div>
                        </div>
                    ))}
                </div>
            )}

        </div>
    )
}

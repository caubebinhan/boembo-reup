import { useEffect } from 'react'
interface Source {
    type: 'channel' | 'keyword'
    name: string
    avatar?: string
    followerCount?: number
    likeCount?: number
    historyLimit: number
    sortOrder: 'newest' | 'oldest' | 'most_liked' | 'most_viewed'
    timeRange: 'history_only' | 'future_only' | 'history_and_future' | 'custom_range'
    startDate?: string
    endDate?: string
    autoSchedule: boolean
    // Filter conditions
    minLikes?: number
    minViews?: number
    maxViews?: number
    withinDays?: number
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
        try {
            // @ts-ignore
            await window.api.invoke('open-scanner-window')
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="flex flex-col gap-6 text-slate-800 max-w-4xl mx-auto pb-10">

            {/* HEADER */}
            <div className="flex justify-between items-center bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 p-6 rounded-2xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col gap-1">
                    <h2 className="text-2xl font-bold text-slate-800">Step 2: Content Sources</h2>
                    <p className="text-slate-400">Configure channels & keywords to monitor.</p>
                </div>

                {sources.length > 0 && (
                    <div className="relative z-10 flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-400">SOURCES ({sources.length})</span>
                        <button
                            onClick={handleScanClick}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-medium transition flex items-center gap-2 shadow-lg shadow-purple-200 cursor-pointer"
                        >
                            <span>🔍</span> Scan Sources
                        </button>
                    </div>
                )}
            </div>

            {/* EMPTY STATE */}
            {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50">
                    <div className="text-5xl mb-4">📡</div>
                    <h3 className="text-xl font-bold mb-2 text-slate-700">No Sources Configured</h3>
                    <p className="text-slate-400 mb-8 text-center max-w-md">
                        Add channels or keywords to automatically find and process content for this campaign.
                    </p>
                    <button
                        onClick={handleScanClick}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold text-lg transition shadow-lg shadow-purple-200 cursor-pointer"
                    >
                        🔍 Scan & Add Sources
                    </button>
                </div>
            ) : (
                /* LIST STATE */
                <div className="flex flex-col gap-4">
                    {sources.map((source, index) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>

                            {/* Card Header */}
                            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md overflow-hidden">
                                        {source.avatar ? <img src={source.avatar} className="w-full h-full rounded-full object-cover" /> : source.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-lg text-slate-800">{source.name}</span>
                                        {!!(source.followerCount || source.likeCount) && (
                                            <div className="flex items-center gap-3 text-xs text-slate-400">
                                                {source.followerCount != null && <span>👥 {source.followerCount.toLocaleString()} followers</span>}
                                                {source.likeCount != null && <span>❤️ {source.likeCount.toLocaleString()} likes</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeSource(index)}
                                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition cursor-pointer"
                                    title="Remove Source"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Card Body */}
                            <div className="p-5 grid grid-cols-2 gap-6">

                                {/* SCAN LIMIT */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                        <span>🎯</span> SCAN LIMIT
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min="1" max="9999"
                                            value={source.historyLimit}
                                            onChange={(e) => updateSource(index, { historyLimit: Number(e.target.value) })}
                                            className="bg-white border border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 rounded-lg p-2 w-24 outline-none font-medium text-slate-700 transition"
                                        />
                                        <span className="text-slate-400">videos</span>
                                    </div>
                                </div>

                                {/* SORTING */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                        <span>🎲</span> SORTING
                                    </label>
                                    <select
                                        value={source.sortOrder}
                                        onChange={(e) => updateSource(index, { sortOrder: e.target.value as any })}
                                        className="bg-white border border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 rounded-lg p-2 outline-none font-medium text-slate-700 appearance-none transition"
                                    >
                                        <option value="newest">Newest</option>
                                        <option value="oldest">Oldest</option>
                                        <option value="most_liked">Most Liked</option>
                                        <option value="most_viewed">Most Viewed</option>
                                    </select>
                                </div>

                                {/* TIME RANGE */}
                                <div className="flex flex-col gap-2 col-span-2 border-t border-slate-100 pt-5 mt-1">
                                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                        <span>📅</span> TIME RANGE
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select
                                            value={source.timeRange}
                                            onChange={(e) => updateSource(index, { timeRange: e.target.value as any })}
                                            className="bg-white border border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 rounded-lg p-2 outline-none font-medium text-slate-700 max-w-sm transition"
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
                                                    className="bg-white border border-slate-200 rounded-lg p-2 outline-none text-slate-700 transition"
                                                />
                                                <span className="text-slate-300">→</span>
                                                <input
                                                    type="date"
                                                    value={source.endDate || ''}
                                                    onChange={(e) => updateSource(index, { endDate: e.target.value })}
                                                    className="bg-white border border-slate-200 rounded-lg p-2 outline-none text-slate-700 transition"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* FILTER CONDITIONS */}
                                <div className="col-span-2 border-t border-slate-100 pt-5 mt-1">
                                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-3">
                                        <span>🔍</span> FILTER CONDITIONS
                                    </label>
                                    <p className="text-xs text-slate-300 mb-3">Chỉ lấy video thoả mãn các điều kiện bên dưới. Để trống = không lọc.</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-400">Min Likes</label>
                                            <input
                                                type="number" min={0}
                                                placeholder="e.g. 1000"
                                                value={source.minLikes || ''}
                                                onChange={(e) => updateSource(index, { minLikes: Number(e.target.value) || undefined })}
                                                className="bg-white border border-slate-200 focus:border-purple-400 rounded-lg p-2 outline-none text-sm text-slate-700 transition"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-400">Min Views</label>
                                            <input
                                                type="number" min={0}
                                                placeholder="e.g. 10000"
                                                value={source.minViews || ''}
                                                onChange={(e) => updateSource(index, { minViews: Number(e.target.value) || undefined })}
                                                className="bg-white border border-slate-200 focus:border-purple-400 rounded-lg p-2 outline-none text-sm text-slate-700 transition"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-400">Max Views</label>
                                            <input
                                                type="number" min={0}
                                                placeholder="e.g. 500000"
                                                value={source.maxViews || ''}
                                                onChange={(e) => updateSource(index, { maxViews: Number(e.target.value) || undefined })}
                                                className="bg-white border border-slate-200 focus:border-purple-400 rounded-lg p-2 outline-none text-sm text-slate-700 transition"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-400">Within Days</label>
                                            <input
                                                type="number" min={1}
                                                placeholder="e.g. 30"
                                                value={source.withinDays || ''}
                                                onChange={(e) => updateSource(index, { withinDays: Number(e.target.value) || undefined })}
                                                className="bg-white border border-slate-200 focus:border-purple-400 rounded-lg p-2 outline-none text-sm text-slate-700 transition"
                                            />
                                        </div>
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
                                            <div className="font-semibold text-slate-700 group-hover:text-purple-600 transition">Auto-schedule videos</div>
                                            <div className="text-sm text-slate-400">Nếu tắt, bạn phải duyệt thủ công video từ source này.</div>
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

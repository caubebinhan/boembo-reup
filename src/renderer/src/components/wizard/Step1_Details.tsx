interface Step1Props {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

export function Step1_Details({ data, updateData }: Step1Props) {
    const insertTag = (tag: string) => {
        const current = data.captionTemplate || ''
        updateData({ captionTemplate: current + tag })
    }

    const toggleDay = (day: string) => {
        const days = data.activeDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        if (days.includes(day)) {
            updateData({ activeDays: days.filter((d: string) => d !== day) })
        } else {
            updateData({ activeDays: [...days, day] })
        }
    }

    return (
        <div className="flex flex-col gap-8 text-white max-w-3xl mx-auto pb-10">
            {/* SECTION 1: Campaign Name */}
            <div className="flex flex-col gap-2">
                <label className="font-semibold text-lg">Campaign Name</label>
                <input
                    type="text"
                    placeholder="My awesome campaign..."
                    className="bg-gray-800 border-2 border-gray-700 focus:border-purple-600 rounded-lg p-3 outline-none transition"
                    value={data.name || ''}
                    onChange={(e) => updateData({ name: e.target.value })}
                />
            </div>

            {/* SECTION 2: Campaign Type */}
            <div className="flex flex-col gap-2">
                <label className="font-semibold text-lg">Campaign Type</label>
                <div className="grid grid-cols-2 gap-4">
                    <div
                        onClick={() => updateData({ campaignType: 'scan_video' })}
                        className={`p-4 rounded-lg cursor-pointer border-2 transition ${data.campaignType === 'scan_video'
                                ? 'border-purple-600 bg-purple-600/10'
                                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-3 font-semibold mb-2">
                            <span className="text-xl">{data.campaignType === 'scan_video' ? '○' : '○'}</span>
                            Scan Video Mode
                        </div>
                        <p className="text-sm text-gray-400 pl-8">Select specific videos to process and repost manually.</p>
                    </div>

                    <div
                        onClick={() => updateData({ campaignType: 'scan_channel' })}
                        className={`p-4 rounded-lg cursor-pointer border-2 transition ${data.campaignType === 'scan_channel'
                                ? 'border-purple-600 bg-purple-600/10'
                                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-3 font-semibold mb-2">
                            <span className="text-xl">{data.campaignType === 'scan_channel' ? '●' : '○'}</span>
                            Scan Channel / Keyword Mode
                        </div>
                        <p className="text-sm text-gray-400 pl-8">Automatically monitor streams and fetch new content.</p>
                    </div>
                </div>
            </div>

            {/* SECTION 3: Advanced Verification */}
            {data.campaignType === 'scan_channel' && (
                <div
                    onClick={() => updateData({ advancedVerification: !data.advancedVerification })}
                    className="p-4 rounded-lg cursor-pointer border-2 border-gray-700 bg-gray-800 flex flex-col gap-1 hover:border-gray-600 transition"
                >
                    <div className="flex items-center gap-3 font-semibold">
                        <input type="checkbox" checked={!!data.advancedVerification} readOnly className="w-4 h-4 accent-purple-600" />
                        Advanced Verification (Unique Tag)
                    </div>
                    <p className="text-sm text-gray-400 pl-7">Appends a unique 6-char tag to caption to bypass strict checks.</p>
                </div>
            )}

            {/* SECTION 4: Caption Template */}
            <div className="flex flex-col gap-2">
                <div>
                    <h3 className="font-semibold text-lg">📋 Caption Template</h3>
                    <p className="text-sm text-gray-400">Customize the caption styling and keywords appended.</p>
                </div>

                <div className="flex flex-wrap gap-2 mb-1 mt-2">
                    {['[Original Desc]', '[No Hashtags]', '[Time (HH:mm)]', '[Date (YYYY-MM-DD)]', '[Author]', '[Tags]'].map(tag => (
                        <button
                            key={tag}
                            onClick={() => insertTag(` ${tag} `)}
                            className="bg-gray-800 hover:bg-gray-700 text-xs px-3 py-1.5 rounded text-gray-300 transition border border-gray-700"
                        >
                            {tag}
                        </button>
                    ))}
                </div>

                <textarea
                    className="bg-gray-800 border-2 border-gray-700 focus:border-purple-600 rounded-lg p-3 outline-none min-h-[100px] resize-y font-mono text-sm"
                    placeholder="{original}"
                    value={data.captionTemplate || ''}
                    onChange={(e) => updateData({ captionTemplate: e.target.value })}
                />
            </div>

            <hr className="border-gray-800 my-2" />

            {/* SECTION 5: First Run Time */}
            <div className="flex flex-col gap-2">
                <label className="font-semibold">First Run Time</label>
                <input
                    type="datetime-local"
                    className="bg-gray-800 border-2 border-gray-700 focus:border-purple-600 rounded-lg p-3 outline-none w-full max-w-sm"
                    value={data.firstRunAt || ''}
                    onChange={(e) => updateData({ firstRunAt: e.target.value })}
                />
            </div>

            {/* SECTION 6: Auto-schedule */}
            <label className="flex items-center gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    className="w-5 h-5 accent-purple-600"
                    checked={data.autoSchedule !== false}
                    onChange={(e) => updateData({ autoSchedule: e.target.checked })}
                />
                <div>
                    <div className="font-semibold">Auto-schedule tasks</div>
                    <div className="text-sm text-gray-400">(Uncheck if you prefer manual approval)</div>
                </div>
            </label>

            {/* SECTION 7: Recurring Interval */}
            <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 flex flex-col gap-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <span>🔄</span> Recurring Interval
                </h3>

                <div className="grid grid-cols-2 gap-6">
                    <div className="flex items-center justify-between col-span-2">
                        <span className="font-medium text-gray-300">Repeat Every (Minutes)</span>
                        <input
                            type="number"
                            className="bg-gray-800 border border-gray-700 rounded-lg p-2 w-24 text-center focus:border-purple-600 outline-none"
                            value={data.intervalMinutes || 60}
                            onChange={(e) => updateData({ intervalMinutes: Number(e.target.value) })}
                        />
                    </div>

                    <label className="flex items-center gap-3 col-span-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="w-4 h-4 accent-purple-600"
                            checked={!!data.enableJitter}
                            onChange={(e) => updateData({ enableJitter: e.target.checked })}
                        />
                        <span className="font-medium text-gray-300">Enable Jitter (Random ±50%)</span>
                    </label>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-gray-400 font-medium">Active Hours Start (Daily)</label>
                        <input
                            type="time"
                            className="bg-gray-800 border border-gray-700 rounded-lg p-2 focus:border-purple-600 outline-none"
                            value={data.activeHoursStart || '09:00'}
                            onChange={(e) => updateData({ activeHoursStart: e.target.value })}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-gray-400 font-medium">Active Hours End (Daily)</label>
                        <input
                            type="time"
                            className="bg-gray-800 border border-gray-700 rounded-lg p-2 focus:border-purple-600 outline-none"
                            value={data.activeHoursEnd || '21:00'}
                            onChange={(e) => updateData({ activeHoursEnd: e.target.value })}
                        />
                    </div>

                    <div className="col-span-2 flex flex-col gap-2">
                        <label className="text-sm text-gray-400 font-medium">Active Days</label>
                        <div className="flex flex-wrap gap-2">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                                const isActive = (data.activeDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).includes(day)
                                return (
                                    <button
                                        key={day}
                                        onClick={() => toggleDay(day)}
                                        className={`px-4 py-2 rounded-lg font-medium text-sm transition ${isActive
                                                ? 'bg-purple-600 border border-purple-500 text-white'
                                                : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-500'
                                            }`}
                                    >
                                        {day}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 8: Missed Job Handling */}
            <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 flex flex-col gap-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <span>🔄</span> Missed Job Handling
                </h3>

                <div className="grid grid-cols-2 gap-4">
                    <div
                        onClick={() => updateData({ missedJobHandling: 'auto' })}
                        className={`p-4 rounded-lg cursor-pointer border-2 transition ${(data.missedJobHandling || 'auto') === 'auto'
                                ? 'border-purple-600 bg-purple-600/10'
                                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-2 font-semibold mb-1">
                            <span className="text-purple-400">●</span> Auto Reschedule
                        </div>
                        <p className="text-xs text-gray-400 leading-snug">Automatically reschedule missed jobs for the next available slot.</p>
                    </div>

                    <div
                        onClick={() => updateData({ missedJobHandling: 'manual' })}
                        className={`p-4 rounded-lg cursor-pointer border-2 transition ${data.missedJobHandling === 'manual'
                                ? 'border-purple-600 bg-purple-600/10'
                                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-2 font-semibold mb-1">
                            <span className="text-gray-500">○</span> Manual Reschedule
                        </div>
                        <p className="text-xs text-gray-400 leading-snug">Pause campaign and wait for manual action if jobs are missed.</p>
                    </div>
                </div>
            </div>

        </div>
    )
}

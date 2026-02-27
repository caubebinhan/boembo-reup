import { useMemo, useEffect } from 'react'
import { computeScheduleSlots, type TimeRange } from '@shared/scheduling'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Step4Props {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

const DEFAULT_RANGES: TimeRange[] = [
    { days: [1, 2, 3, 4, 5], start: '09:00', end: '21:00' },
]

export function Step4_Schedule({ data, updateData }: Step4Props) {
    const ranges: TimeRange[] = data.timeRanges || DEFAULT_RANGES

    useEffect(() => {
        const defaults: Record<string, any> = {}
        if (data.intervalMinutes == null) defaults.intervalMinutes = 60
        if (!data.timeRanges) defaults.timeRanges = DEFAULT_RANGES
        if (Object.keys(defaults).length > 0) updateData(defaults)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const updateRanges = (newRanges: TimeRange[]) => updateData({ timeRanges: newRanges })

    const addRange = () => {
        updateRanges([...ranges, { days: [0, 6], start: '10:00', end: '18:00' }])
    }

    const removeRange = (i: number) => {
        const next = ranges.filter((_, idx) => idx !== i)
        updateRanges(next.length > 0 ? next : DEFAULT_RANGES)
    }

    const updateRange = (i: number, patch: Partial<TimeRange>) => {
        const next = ranges.map((r, idx) => idx === i ? { ...r, ...patch } : r)
        updateRanges(next)
    }

    const toggleDay = (rangeIdx: number, day: number) => {
        const r = ranges[rangeIdx]
        const days = r.days.includes(day) ? r.days.filter(d => d !== day) : [...r.days, day].sort((a, b) => a - b)
        updateRange(rangeIdx, { days })
    }

    const intervalMinutes = data.intervalMinutes || 60
    const enableJitter = !!data.enableJitter

    // Live preview using shared computeScheduleSlots (fixed interval, no jitter simulation)
    const preview = useMemo(() => {
        const slots = computeScheduleSlots({
            cursor: Date.now(),
            intervalMinutes,
            enableJitter: false,
            ranges,
            count: 5,
        })
        return slots.map(s => ({
            time: new Date(s.timestamp).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
            gapLabel: s.gapMs != null ? `+${Math.round(s.gapMs / 60_000)}min${enableJitter ? ' (±50%)' : ''}` : undefined,
        }))
    }, [intervalMinutes, enableJitter, ranges])

    return (
        <div className="flex flex-col gap-6 text-slate-800 max-w-4xl mx-auto pb-10">

            {/* Gap + Jitter — inline */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <label className="text-xs font-bold text-slate-400 block mb-3">⏱ Gap between videos</label>
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <input
                            type="number" min={1}
                            value={intervalMinutes}
                            onChange={(e) => updateData({ intervalMinutes: Number(e.target.value) })}
                            className="bg-white border border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 rounded-lg p-2.5 w-20 outline-none text-sm font-medium text-slate-700 transition"
                        />
                        <span className="text-sm text-slate-400">min</span>
                    </div>

                    <div className="w-px h-8 bg-slate-200" />

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 accent-purple-600"
                            checked={enableJitter}
                            onChange={(e) => updateData({ enableJitter: e.target.checked })}
                        />
                        <span className="text-sm text-slate-600 font-medium">Jitter ±50%</span>
                        {enableJitter && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 ml-1">
                                🎲 {Math.round(intervalMinutes * 0.5)}–{Math.round(intervalMinutes * 1.5)}min
                            </span>
                        )}
                    </label>
                </div>
            </div>

            {/* Multi time ranges */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-400 tracking-wider">📅 DAILY ACTIVE HOURS</h3>
                    <button
                        onClick={addRange}
                        className="text-xs bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-600 px-3 py-1.5 rounded-lg transition flex items-center gap-1 font-medium cursor-pointer"
                    >
                        ＋ Add time slot
                    </button>
                </div>
                <p className="text-xs text-slate-400">Videos will only be scheduled within these time windows. Add multiple slots for different days or time ranges.</p>

                {ranges.map((r, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1 flex-wrap">
                                {DAY_NAMES.map((name, day) => (
                                    <button
                                        key={day}
                                        onClick={() => toggleDay(i, day)}
                                        className={`w-9 h-9 rounded-lg text-xs font-bold transition border cursor-pointer ${r.days.includes(day)
                                            ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-purple-300 hover:text-purple-500'
                                            }`}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <input
                                    type="time"
                                    value={r.start}
                                    onChange={(e) => updateRange(i, { start: e.target.value })}
                                    className="bg-white border border-slate-200 focus:border-purple-400 rounded-lg p-2 outline-none text-sm text-slate-700 transition"
                                />
                                <span className="text-slate-300 font-medium">→</span>
                                <input
                                    type="time"
                                    value={r.end}
                                    onChange={(e) => updateRange(i, { end: e.target.value })}
                                    className="bg-white border border-slate-200 focus:border-purple-400 rounded-lg p-2 outline-none text-sm text-slate-700 transition"
                                />
                            </div>

                            {ranges.length > 1 && (
                                <button
                                    onClick={() => removeRange(i)}
                                    className="text-slate-300 hover:text-red-500 transition text-lg shrink-0 cursor-pointer"
                                    title="Remove slot"
                                >✕</button>
                            )}
                        </div>

                        <div className="text-xs text-slate-400">
                            {r.days.length === 7 ? 'Every day' :
                                r.days.length === 0 ? '⚠️ No days selected' :
                                    r.days.map(d => DAY_NAMES[d]).join(', ')}
                            {' · '}{r.start} – {r.end}
                        </div>
                    </div>
                ))}
            </div>

            {/* Preview */}
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-slate-400 tracking-wider">
                    🗓 SCHEDULE PREVIEW (next 5 slots)
                    {enableJitter && <span className="ml-2 text-amber-600 font-normal text-xs">🎲 jitter active</span>}
                </h3>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    {preview.length === 0 ? (
                        <div className="text-slate-400 italic p-4 text-center text-sm">Set time ranges to see preview</div>
                    ) : preview.map((slot, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                            <span className="text-xs bg-purple-50 text-purple-600 font-mono px-2 py-1 rounded-md border border-purple-200 font-semibold">#{idx + 1}</span>
                            <span className="text-sm font-mono flex-1 text-slate-700">{slot.time}</span>
                            {slot.gapLabel && (
                                <span className={`text-xs font-mono ${enableJitter ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {slot.gapLabel}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

        </div>
    )
}

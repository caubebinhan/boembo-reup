import { useEffect, useMemo } from 'react'

interface WizardDetailsProps {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

const EXAMPLE_ORIGINAL = 'Đây là video hot nhất hôm nay 🔥 #tiktok #viral'

function applyCaptionTemplate(template: string, original: string): string {
    if (!template.trim()) return original
    let result = template
    result = result.replace(/\[Original Desc\]/gi, original)
    result = result.replace(/\[No Hashtags\]/gi, original.replace(/#\S+/g, '').trim())
    result = result.replace(/\[Time \(HH:mm\)\]/gi, new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
    result = result.replace(/\[Date \(YYYY-MM-DD\)\]/gi, new Date().toISOString().slice(0, 10))
    result = result.replace(/\[Author\]/gi, '@example_author')
    result = result.replace(/\[Tags\]/gi, '#fyp #viral')
    return result
}

export function WizardDetails({ data, updateData }: WizardDetailsProps) {
    useEffect(() => {
        const defaults: Record<string, any> = {}
        if (data.missedJobHandling == null) defaults.missedJobHandling = 'auto'
        if (Object.keys(defaults).length > 0) updateData(defaults)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const insertTag = (tag: string) => {
        const current = data.captionTemplate || ''
        updateData({ captionTemplate: current + tag })
    }

    const captionPreview = useMemo(() => {
        return applyCaptionTemplate(data.captionTemplate || '', EXAMPLE_ORIGINAL)
    }, [data.captionTemplate])

    const TAGS = [
        { tag: '[Original Desc]', icon: '📄', label: 'Original Desc' },
        { tag: '[No Hashtags]', icon: '🚫', label: 'No Hashtags' },
        { tag: '[Time (HH:mm)]', icon: '🕐', label: 'Time' },
        { tag: '[Date (YYYY-MM-DD)]', icon: '📅', label: 'Date' },
        { tag: '[Author]', icon: '👤', label: 'Author' },
        { tag: '[Tags]', icon: '🏷', label: 'Tags' },
    ]

    return (
        <div className="flex flex-col gap-8 text-slate-800 max-w-3xl mx-auto pb-10">

            {/* SECTION 1: Caption Template */}
            <div className="flex flex-col gap-2">
                <div>
                    <h3 className="font-semibold text-lg text-slate-800">📋 Caption Template</h3>
                    <p className="text-sm text-slate-400">Tuỳ chỉnh caption cho video khi publish. Để trống = giữ nguyên caption gốc.</p>
                </div>

                <div className="flex flex-wrap gap-2 mb-1 mt-2">
                    {TAGS.map(({ tag, icon, label }) => (
                        <button
                            key={tag}
                            onClick={() => insertTag(` ${tag} `)}
                            className="bg-white hover:bg-purple-50 text-xs px-3 py-1.5 rounded-lg text-slate-600 transition border border-slate-200 hover:border-purple-300 hover:text-purple-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                            <span>{icon}</span> {label}
                        </button>
                    ))}
                </div>

                <textarea
                    className="bg-white border-2 border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 rounded-xl p-3 outline-none min-h-[80px] resize-y font-mono text-sm text-slate-700 transition"
                    placeholder="[Original Desc] #fyp #viral"
                    value={data.captionTemplate || ''}
                    onChange={(e) => updateData({ captionTemplate: e.target.value })}
                />

                {/* Live preview */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">Caption Preview</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                            <p className="text-[10px] text-slate-400 mb-1.5 font-semibold">📄 Original</p>
                            <p className="text-xs text-slate-500 leading-relaxed">{EXAMPLE_ORIGINAL}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                            <p className="text-[10px] text-purple-600 mb-1.5 font-semibold">✨ Sẽ đăng</p>
                            <p className="text-xs text-slate-800 leading-relaxed font-medium">{captionPreview}</p>
                        </div>
                    </div>
                </div>
            </div>

            <hr className="border-slate-200 my-1" />

            {/* SECTION 2: Missed Job Handling */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
                <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                    <span>🔄</span> Xử lý video bị missed
                </h3>
                <p className="text-sm text-slate-400 -mt-2">Khi app bị tắt/crash, video đã lên lịch nhưng chưa publish sẽ được xử lý theo cách này.</p>

                <div className="grid grid-cols-2 gap-4">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => updateData({ missedJobHandling: 'auto' })}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateData({ missedJobHandling: 'auto' })}
                        className={`p-4 rounded-xl cursor-pointer border-2 transition hover:shadow-md ${(data.missedJobHandling || 'auto') === 'auto'
                            ? 'border-purple-400 bg-purple-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                    >
                        <div className="flex items-center gap-2 font-semibold mb-1 text-slate-700">
                            <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: (data.missedJobHandling || 'auto') === 'auto' ? '#7c3aed' : '#cbd5e1' }}>
                                {(data.missedJobHandling || 'auto') === 'auto' && <span className="w-2 h-2 rounded-full bg-purple-600" />}
                            </span>
                            Tự động lên lịch lại
                        </div>
                        <p className="text-xs text-slate-400 leading-snug ml-6">Tự reschedule video bị missed khi app restart. Không cần can thiệp.</p>
                    </div>

                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => updateData({ missedJobHandling: 'manual' })}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateData({ missedJobHandling: 'manual' })}
                        className={`p-4 rounded-xl cursor-pointer border-2 transition hover:shadow-md ${data.missedJobHandling === 'manual'
                            ? 'border-purple-400 bg-purple-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                    >
                        <div className="flex items-center gap-2 font-semibold mb-1 text-slate-700">
                            <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: data.missedJobHandling === 'manual' ? '#7c3aed' : '#cbd5e1' }}>
                                {data.missedJobHandling === 'manual' && <span className="w-2 h-2 rounded-full bg-purple-600" />}
                            </span>
                            Tạm dừng chờ duyệt
                        </div>
                        <p className="text-xs text-slate-400 leading-snug ml-6">Tạm dừng campaign khi phát hiện video bị missed. Bạn tự kiểm tra và resume.</p>
                    </div>
                </div>
            </div>

        </div>
    )
}

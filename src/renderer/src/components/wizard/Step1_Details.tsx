import { useEffect, useMemo } from 'react'

interface Step1Props {
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

export function Step1_Details({ data, updateData }: Step1Props) {
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

    return (
        <div className="flex flex-col gap-8 text-white max-w-3xl mx-auto pb-10">

            {/* SECTION 1: Caption Template */}
            <div className="flex flex-col gap-2">
                <div>
                    <h3 className="font-semibold text-lg">📋 Caption Template</h3>
                    <p className="text-sm text-gray-400">Tuỳ chỉnh caption cho video khi publish. Để trống = giữ nguyên caption gốc.</p>
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
                    className="bg-gray-800 border-2 border-gray-700 focus:border-purple-600 rounded-lg p-3 outline-none min-h-[80px] resize-y font-mono text-sm"
                    placeholder="[Original Desc] #fyp #viral"
                    value={data.captionTemplate || ''}
                    onChange={(e) => updateData({ captionTemplate: e.target.value })}
                />

                {/* Live preview */}
                <div className="bg-[#0f172a] border border-gray-700 rounded-lg p-3 mt-1">
                    <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Caption Preview</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] text-gray-500 mb-1">📄 Original</p>
                            <p className="text-xs text-gray-400 leading-relaxed">{EXAMPLE_ORIGINAL}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-purple-400 mb-1">✨ Sẽ đăng</p>
                            <p className="text-xs text-white leading-relaxed">{captionPreview}</p>
                        </div>
                    </div>
                </div>
            </div>

            <hr className="border-gray-800 my-2" />

            {/* SECTION 2: Missed Job Handling */}
            <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 flex flex-col gap-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <span>🔄</span> Xử lý video bị missed
                </h3>
                <p className="text-sm text-gray-500 -mt-2">Khi app bị tắt/crash, video đã lên lịch nhưng chưa publish sẽ được xử lý theo cách này.</p>

                <div className="grid grid-cols-2 gap-4">
                    <div
                        onClick={() => updateData({ missedJobHandling: 'auto' })}
                        className={`p-4 rounded-lg cursor-pointer border-2 transition ${(data.missedJobHandling || 'auto') === 'auto'
                            ? 'border-purple-600 bg-purple-600/10'
                            : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-2 font-semibold mb-1">
                            <span className="text-purple-400">●</span> Tự động lên lịch lại
                        </div>
                        <p className="text-xs text-gray-400 leading-snug">Tự reschedule video bị missed khi app restart. Không cần can thiệp.</p>
                    </div>

                    <div
                        onClick={() => updateData({ missedJobHandling: 'manual' })}
                        className={`p-4 rounded-lg cursor-pointer border-2 transition ${data.missedJobHandling === 'manual'
                            ? 'border-purple-600 bg-purple-600/10'
                            : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-2 font-semibold mb-1">
                            <span className="text-gray-500">○</span> Tạm dừng chờ duyệt
                        </div>
                        <p className="text-xs text-gray-400 leading-snug">Tạm dừng campaign khi phát hiện video bị missed. Bạn tự kiểm tra và resume.</p>
                    </div>
                </div>
            </div>

        </div>
    )
}

import { useWizardStep } from './useWizardStep'
import { useState } from 'react'

export function TikTokChannelPicker() {
    const { currentValue, commit, goBack } = useWizardStep<string[]>('channels')
    const [selected, setSelected] = useState<string[]>(currentValue || [])

    const handleNext = () => {
        if (selected.length > 0) commit(selected)
    }

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Select TikTok Channels</h2>
            {/* Mock channel list */}
            <div className="space-y-2 mb-4">
                {['@channel1', '@channel2', '@channel3'].map((ch) => (
                    <label key={ch} className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={selected.includes(ch)}
                            onChange={(e) => {
                                const s = new Set(selected)
                                if (e.target.checked) s.add(ch)
                                else s.delete(ch)
                                setSelected(Array.from(s))
                            }}
                        />
                        <span>{ch}</span>
                    </label>
                ))}
            </div>
            <div className="flex justify-between">
                <button className="px-4 py-2 bg-gray-200 rounded" onClick={goBack}>Back</button>
                <button
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                    disabled={selected.length === 0}
                    onClick={handleNext}
                >
                    Next
                </button>
            </div>
        </div>
    )
}

import { useWizardStep } from './useWizardStep'
import { useState } from 'react'

export function TikTokVideoPicker() {
    const { session, currentValue, commit, goBack } = useWizardStep<string[]>('videos')
    const [selected, setSelected] = useState<string[]>(currentValue || [])

    const handleNext = () => {
        if (selected.length > 0) commit(selected)
    }

    // Could use session.outputs['channels'] here to fetch videos
    const mockVideos = ['video_1', 'video_2', 'video_3', 'video_4']

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Select Videos to Repost</h2>
            <p className="text-gray-500 mb-4">From Channels: {(session?.outputs['channels'] || []).join(', ')}</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
                {mockVideos.map(vid => (
                    <div key={vid} className="border p-2 rounded cursor-pointer" onClick={() => {
                        const s = new Set(selected)
                        if (s.has(vid)) s.delete(vid)
                        else s.add(vid)
                        setSelected(Array.from(s))
                    }}>
                        <input type="checkbox" checked={selected.includes(vid)} readOnly className="mr-2" />
                        <span>{vid}</span>
                    </div>
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

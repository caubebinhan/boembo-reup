import { useWizardStep } from './useWizardStep'
import { useState } from 'react'

export function ScheduleSetting() {
    const { currentValue, commit, goBack } = useWizardStep<any>('schedule')
    const [gap, setGap] = useState(currentValue?.gap_minutes || 60)
    const [maxPerDay, setMaxPerDay] = useState(currentValue?.max_per_day || 5)

    const handleNext = () => commit({ gap_minutes: gap, max_per_day: maxPerDay })

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Schedule Setting</h2>
            <div className="space-y-4 mb-4">
                <div>
                    <label className="block mb-1">Gap between posts (minutes)</label>
                    <input
                        type="number"
                        className="border p-2 rounded w-full"
                        value={gap}
                        onChange={(e) => setGap(Number(e.target.value))}
                    />
                </div>
                <div>
                    <label className="block mb-1">Max posts per day</label>
                    <input
                        type="number"
                        className="border p-2 rounded w-full"
                        value={maxPerDay}
                        onChange={(e) => setMaxPerDay(Number(e.target.value))}
                    />
                </div>
            </div>
            <div className="flex justify-between">
                <button className="px-4 py-2 bg-gray-200 rounded" onClick={goBack}>Back</button>
                <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={handleNext}>Next</button>
            </div>
        </div>
    )
}

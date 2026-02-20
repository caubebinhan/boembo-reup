import { useState, useEffect } from 'react'
import { useWizardStep } from '../wizard/useWizardStep'

export function SchedulePreview() {
    const { currentValue } = useWizardStep<any>('schedule')
    const [previewItems, setPreviewItems] = useState<Date[]>([])

    useEffect(() => {
        if (!currentValue?.gap_minutes) return
        const gapMs = currentValue.gap_minutes * 60 * 1000
        const max = currentValue.max_per_day || 5

        const items: Date[] = []
        let current = Date.now()
        let postsToday = 0

        // Simulate 10 items
        for (let i = 0; i < 10; i++) {
            if (postsToday >= max) {
                const nextDay = new Date(current)
                nextDay.setDate(nextDay.getDate() + 1)
                nextDay.setHours(9, 0, 0, 0)
                current = nextDay.getTime()
                postsToday = 0
            } else {
                current += gapMs
            }
            items.push(new Date(current))
            postsToday++
        }

        setPreviewItems(items)
    }, [currentValue])

    return (
        <div className="mt-6 border-t pt-4">
            <h3 className="font-bold mb-2">Schedule Preview (Next 10)</h3>
            <div className="space-y-1 text-sm text-gray-600">
                {previewItems.map((d, i) => (
                    <div key={i}>#{i + 1}: {d.toLocaleString()}</div>
                ))}
            </div>
        </div>
    )
}

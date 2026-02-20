import { useWizardStep } from './useWizardStep'
import { useState } from 'react'

export function AccountPicker() {
    const { currentValue, commit, goBack } = useWizardStep<string>('account')
    const [selected, setSelected] = useState<string>(currentValue || '')

    const handleNext = () => {
        if (selected) commit(selected)
    }

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Select Target Account</h2>
            <select
                className="w-full border p-2 mb-4 rounded"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
            >
                <option value="">-- Choose Account --</option>
                <option value="acc_1">@my_repost_page_1</option>
                <option value="acc_2">@my_repost_page_2</option>
            </select>

            <div className="flex justify-between">
                <button className="px-4 py-2 bg-gray-200 rounded" onClick={goBack}>Back</button>
                <button
                    className="px-4 py-2 bg-green-500 text-white rounded"
                    disabled={!selected}
                    onClick={handleNext}
                >
                    Finish & Create Campaign
                </button>
            </div>
        </div>
    )
}

import { useSelector } from 'react-redux'
import { RootState } from '../store/store'

export function InteractionBadge({ campaignId }: { campaignId: string }) {
    const waitingInfo = useSelector((state: RootState) => state.interaction.waiting[campaignId])

    if (!waitingInfo) return null

    const handleResolve = () => {
        // Notify main to continue
        // window.api.invoke('pipeline:interaction_resolved', { campaignId })
    }

    return (
        <div className="bg-yellow-100 border border-yellow-300 px-4 py-2 rounded-lg flex items-center space-x-3 animate-pulse">
            <div>
                <span className="font-bold text-yellow-800 text-sm">{waitingInfo.type.toUpperCase()} REQUIRED</span>
                <p className="text-xs text-yellow-700">{waitingInfo.message}</p>
            </div>
            <button
                onClick={handleResolve}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 text-xs rounded shadow"
            >
                Resolve Manually
            </button>
        </div>
    )
}

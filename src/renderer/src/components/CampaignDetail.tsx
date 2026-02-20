import { useSelector } from 'react-redux'
import { RootState } from '../store/store'
import { VideoTimeline } from './VideoTimeline'
import { InteractionBadge } from './InteractionBadge'

export function CampaignDetail() {
    const selectedId = useSelector((state: RootState) => state.campaigns.selected)
    const campaign = useSelector((state: RootState) =>
        state.campaigns.items.find(c => c.id === selectedId)
    )

    if (!campaign) {
        return <div className="p-8 text-gray-500">Select a campaign to view details.</div>
    }

    return (
        <div className="flex-1 flex flex-col h-screen">
            <div className="border-b p-6 bg-white flex justify-between items-center shadow-sm z-10">
                <div>
                    <h2 className="text-2xl font-bold">{campaign.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">Status: {campaign.status}</p>
                </div>
                <InteractionBadge campaignId={campaign.id} />
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
                <VideoTimeline campaignId={campaign.id} />
            </div>
        </div>
    )
}

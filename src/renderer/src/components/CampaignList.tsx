import { useEffect, useState } from 'react'
import { CampaignCard } from './CampaignCard'

interface CampaignListProps {
    onOpenWizard: () => void
}

export function CampaignList({ onOpenWizard }: CampaignListProps) {
    const [campaigns, setCampaigns] = useState<any[]>([])

    const fetchCampaigns = async () => {
        try {
            // @ts-ignore
            const data = await window.api.invoke('campaign:list')
            setCampaigns(data)
        } catch (err) {
            console.error(err)
        }
    }

    useEffect(() => {
        fetchCampaigns()

        // Auto-poll each 3s
        const timer = setInterval(fetchCampaigns, 3000)

        // Listen for 'campaigns-updated' event
        // @ts-ignore
        const off = window.api.on('campaigns-updated', fetchCampaigns)

        return () => {
            clearInterval(timer)
            if (typeof off === 'function') off()
        }
    }, [])

    const handleCampaignAction = (event: string, payload: any) => {
        console.log('Campaign action:', event, payload)
        // Send to IPC
        // @ts-ignore
        window.api.invoke(event, payload).then(fetchCampaigns)
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-6 h-screen text-white">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">All Campaigns ({campaigns.length})</h1>
                <button
                    onClick={onOpenWizard}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                    + New
                </button>
            </div>

            <div className="flex flex-col gap-3">
                {campaigns.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 bg-gray-800 rounded-lg border border-gray-700">
                        <p>No campaigns yet. Click + New to get started.</p>
                    </div>
                ) : (
                    campaigns.map(camp => (
                        <CampaignCard
                            key={camp.id}
                            campaign={camp}
                            onAction={handleCampaignAction}
                        />
                    ))
                )}
            </div>
        </div>
    )
}


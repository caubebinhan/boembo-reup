import { useEffect, useState } from 'react'
import { CampaignCard } from './CampaignCard'

interface CampaignListProps {
    onOpenWizard: () => void
    onAction: (event: string, payload: any) => void
}

export function CampaignList({ onOpenWizard, onAction }: CampaignListProps) {
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
        const timer = setInterval(fetchCampaigns, 3000)
        // @ts-ignore
        const off = window.api.on('campaigns-updated', fetchCampaigns)
        return () => {
            clearInterval(timer)
            if (typeof off === 'function') off()
        }
    }, [])

    const handleCampaignAction = (event: string, payload: any) => {
        console.log('Campaign action:', event, payload)
        if (event === 'campaign:view-details') {
            onAction(event, payload)
            return
        }
        // @ts-ignore
        window.api.invoke(event, payload).then(fetchCampaigns)
    }

    return (
        <div className="flex-1 overflow-y-auto bg-vintage-white p-8 h-full text-vintage-charcoal">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-medium text-vintage-charcoal">All Campaigns ({campaigns.length})</h1>
                <button
                    onClick={onOpenWizard}
                    className="bg-pastel-peach hover:bg-[#ebd5c5] text-vintage-charcoal px-6 py-2.5 rounded-full font-medium transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-95"
                >
                    + New Campaign
                </button>
            </div>

            <div className="flex flex-col gap-4">
                {campaigns.length === 0 ? (
                    <div className="text-center py-16 text-vintage-gray bg-vintage-cream/50 rounded-2xl border border-vintage-border shadow-sm">
                        <p className="text-lg">No campaigns yet. Click + New Campaign to get started.</p>
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

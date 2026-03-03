import { useEffect, useState, useCallback } from 'react'
import { CampaignCard } from './CampaignCard'

interface CampaignListProps {
    onOpenWizard: () => void
    onAction: (event: string, payload: any) => void
}

export function CampaignList({ onOpenWizard, onAction }: CampaignListProps) {
    const [campaigns, setCampaigns] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchCampaigns = useCallback(async () => {
        try {
            // @ts-ignore
            const data = await window.api.invoke('campaign:list')
            if (Array.isArray(data)) {
                setCampaigns(data)
                setError(null)
            } else {
                console.error('[CampaignList] Unexpected response from campaign:list:', data)
                setError('Received invalid campaign data from server')
            }
        } catch (err: any) {
            console.error('[CampaignList] Failed to fetch campaigns:', err)
            setError(`Failed to load campaigns: ${err?.message || 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchCampaigns()
        const timer = setInterval(fetchCampaigns, 3000)
        // @ts-ignore
        const off = window.api.on('campaigns-updated', fetchCampaigns)
        return () => {
            clearInterval(timer)
            if (typeof off === 'function') off()
        }
    }, [fetchCampaigns])

    const handleCampaignAction = async (event: string, payload: any) => {
        console.log('Campaign action:', event, payload)
        if (event === 'campaign:view-details') {
            onAction(event, payload)
            return
        }
        try {
            // @ts-ignore
            const result = await window.api.invoke(event, payload)
            if (result?.success === false && result?.error) {
                console.error(`[CampaignList] Action ${event} failed:`, result.error)
            }
            await fetchCampaigns()
        } catch (err: any) {
            console.error(`[CampaignList] Action ${event} failed:`, err)
        }
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

            {/* Error banner */}
            {error && (
                <div className="mb-4 p-4 bg-[#faebeb] border border-[#e2b5b5] rounded-2xl text-[#a84a4a] text-sm flex items-center gap-3 shadow-sm">
                    <span className="text-lg">🥀</span>
                    <span className="flex-1">{error}</span>
                    <button
                        onClick={() => { setError(null); setLoading(true); fetchCampaigns() }}
                        className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#f4dce0] hover:bg-[#e8c5cb] text-[#a84a4a] transition cursor-pointer active:scale-95"
                    >
                        ↻ Retry
                    </button>
                </div>
            )}

            <div className="flex flex-col gap-4">
                {loading ? (
                    <div className="text-center py-16 bg-vintage-cream/50 rounded-2xl border border-vintage-border shadow-sm">
                        <div className="text-4xl mb-3 animate-pulse">🔄</div>
                        <p className="text-vintage-gray text-sm">Loading campaigns...</p>
                    </div>
                ) : campaigns.length === 0 && !error ? (
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

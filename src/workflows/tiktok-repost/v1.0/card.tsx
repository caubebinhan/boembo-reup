import { useMemo } from 'react'

// Per-workflow campaign card for TikTok Repost
// Auto-discovered by CampaignCard via import.meta.glob

interface TikTokRepostCardProps {
    campaign: any
    onAction: (event: string, payload: any) => void
}

export default function TikTokRepostCard({ campaign, onAction }: TikTokRepostCardProps) {
    const config = useMemo(() => {
        try {
            return typeof campaign.params === 'string'
                ? JSON.parse(campaign.params)
                : campaign.params || {}
        } catch { return {} }
    }, [campaign.params])

    const statusConfig: Record<string, { label: string; color: string; bg: string; blink?: boolean }> = {
        idle: { label: '⏸ Idle', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        active: { label: '● Running', color: '#10b981', bg: 'rgba(16,185,129,0.15)', blink: true },
        running: { label: '● Running', color: '#10b981', bg: 'rgba(16,185,129,0.15)', blink: true },
        paused: { label: '⏸ Paused', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
        finished: { label: '✓ Done', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
        error: { label: '✕ Error', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
        needs_captcha: { label: '⚠ Captcha', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    }

    const badge = statusConfig[campaign.status] || statusConfig.idle!!!
    const sourceCount = config.sources?.length || 0

    return (
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition flex flex-col gap-3 relative overflow-hidden group">
            {/* Top row: name + badge */}
            <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg text-white truncate">{campaign.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{sourceCount} source{sourceCount !== 1 ? 's' : ''} • {new Date(campaign.created_at).toLocaleDateString()}</p>
                </div>
                <div
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md shrink-0 ml-3 ${badge.blink ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                >
                    {badge.label}
                </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5" title="Total videos">
                    <span>📋</span>
                    <span className="text-gray-400">{campaign.counters?.queued || 0}</span>
                </div>
                <span className="text-gray-700">|</span>
                <div className="flex items-center gap-1.5" title="Downloaded">
                    <span>⬇️</span>
                    <span className="text-gray-400">{campaign.counters?.downloaded || 0}</span>
                </div>
                <span className="text-gray-700">|</span>
                <div className="flex items-center gap-1.5" title="Published">
                    <span>📤</span>
                    <span className={(campaign.counters?.published || 0) + (campaign.counters?.verification_incomplete || 0) > 0 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                        {(campaign.counters?.published || 0) + (campaign.counters?.verification_incomplete || 0)}
                    </span>
                </div>
                {(campaign.counters?.failed || 0) > 0 && (
                    <>
                        <span className="text-gray-700">|</span>
                        <div className="flex items-center gap-1.5" title="Failed">
                            <span>❌</span>
                            <span className="text-red-400">{campaign.counters.failed}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-2 mt-2 pt-3 border-t border-gray-800">
                <button
                    onClick={() => onAction('campaign:view-details', { id: campaign.id })}
                    className="text-gray-400 hover:text-white px-3 py-1.5 text-sm rounded transition"
                >
                    Details →
                </button>

                <div className="flex-1" />

                {(campaign.status === 'idle' || campaign.status === 'error') && (
                    <button
                        onClick={() => onAction('campaign:trigger', { id: campaign.id })}
                        className="px-4 py-1.5 text-sm rounded font-medium text-white bg-green-600 hover:bg-green-700 transition"
                    >
                        ▶ Run
                    </button>
                )}

                {(campaign.status === 'active' || campaign.status === 'running') && (
                    <button
                        onClick={() => onAction('campaign:pause', { id: campaign.id })}
                        className="px-4 py-1.5 text-sm rounded font-medium text-yellow-300 border border-yellow-800/40 hover:bg-yellow-900/20 transition"
                    >
                        ⏸ Pause
                    </button>
                )}

                {campaign.status === 'paused' && (
                    <button
                        onClick={() => onAction('campaign:resume', { id: campaign.id })}
                        className="px-4 py-1.5 text-sm rounded font-medium text-green-400 border border-green-800/40 hover:bg-green-900/20 transition"
                    >
                        ▶ Resume
                    </button>
                )}

                <button
                    onClick={() => {
                        if (confirm(`Delete campaign "${campaign.name}"?`)) {
                            onAction('campaign:delete', { id: campaign.id })
                        }
                    }}
                    className="px-3 py-1.5 text-sm rounded text-red-400/60 hover:text-red-400 hover:bg-red-900/20 transition"
                >
                    🗑
                </button>
            </div>
        </div>
    )
}

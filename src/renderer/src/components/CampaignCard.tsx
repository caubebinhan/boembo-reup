import { useMemo } from 'react'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'

export interface CampaignCardProps {
    campaign: any
    onAction: (event: string, payload: any) => void
}

export function CampaignCard({ campaign, onAction }: CampaignCardProps) {
    const { descriptor, loading } = useFlowUIDescriptor(campaign.workflow_id || 'tiktok-repost')

    // Parsing campaign config
    const config = useMemo(() => {
        try {
            return typeof campaign.params === 'string'
                ? JSON.parse(campaign.params)
                : campaign.params || {}
        } catch {
            return {}
        }
    }, [campaign.params])

    const evalCtx = { campaign, config, hasActiveJobs: campaign.status === 'running' }

    if (loading || !descriptor?.campaign_card) {
        return (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex items-center justify-center animate-pulse">
                <span className="text-gray-500">Loading flow UI...</span>
            </div>
        )
    }

    const { campaign_card, card_actions = [] } = descriptor

    // Subtitle
    const subtitle = evaluateExpression(campaign_card.subtitle_expr, evalCtx, 'Campaign')

    // Status Badge
    let badge = { label: '• Unknown', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', blink: false }
    if (campaign_card.status_badges) {
        for (const b of campaign_card.status_badges) {
            if (evaluateExpression(b.condition, evalCtx, false)) {
                badge = { ...badge, ...b }
                break
            }
        }
    }

    // Progress
    let progressVal = 0
    let progressColor = '#60a5fa'
    let showProgress = false
    if (campaign_card.progress) {
        showProgress = evaluateExpression(campaign_card.progress.show_if, evalCtx, false)
        if (showProgress) {
            progressVal = evaluateExpression(campaign_card.progress.value_expr, evalCtx, 0)
            progressColor = evaluateExpression(campaign_card.progress.color_expr, evalCtx, '#60a5fa')
        }
    }

    // Stats
    const stats = (campaign_card.stats || []).map((s: any) => {
        const value = evaluateExpression(s.value_expr, evalCtx, 0)
        let color = '#9ca3af' // default gray-400
        if (s.color_expr) {
            color = evaluateExpression(s.color_expr, { ...evalCtx, value }, color)
        }
        const show = s.show_if ? evaluateExpression(s.show_if, evalCtx, true) : true
        return { ...s, value, color, show }
    }).filter((s: any) => s.show)

    // Actions
    const actions = card_actions.filter((a: any) => {
        return a.show_if === "true" || evaluateExpression(a.show_if, evalCtx, false)
    })

    return (
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition flex flex-col gap-3 relative overflow-hidden">
            {showProgress && (
                <div
                    className="absolute top-0 left-0 h-1 transition-all duration-500"
                    style={{ width: `${Math.min(100, progressVal)}%`, backgroundColor: progressColor }}
                />
            )}

            {/* Row 1: Name and Badge */}
            <div className="flex justify-between items-start pt-1">
                <h3 className="font-semibold text-lg text-white">{campaign.name}</h3>
                <div
                    className={`text-xs font-semibold px-2 py-1 rounded-md ${badge.blink ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                >
                    {badge.label}
                </div>
            </div>

            {/* Row 2: Subtitle */}
            <div className="text-sm text-gray-400">
                {subtitle}
            </div>

            {/* Row 3: Stats */}
            <div className="flex items-center text-sm gap-2 mt-1">
                {stats.map((stat: any, idx: number) => (
                    <div key={stat.key} className="flex items-center" title={stat.label}>
                        <span className="mr-1.5">{stat.icon}</span>
                        <span className="font-medium" style={{ color: stat.color }}>{stat.value}</span>
                        {idx < stats.length - 1 && <span className="text-gray-700 mx-2">|</span>}
                    </div>
                ))}
            </div>

            {/* Row 4: Actions */}
            <div className="flex items-center gap-2 mt-3 pt-4 border-t border-gray-800">
                <button
                    onClick={() => onAction('campaign:view-details', { id: campaign.id })}
                    className="text-gray-400 hover:text-white px-3 py-1.5 text-sm rounded bg-transparent transition"
                >
                    View Details →
                </button>

                <div className="flex-1"></div>

                {actions.map((act: any) => {
                    // Extract styles matching old buttons mapping
                    let baseClass = "px-4 py-1.5 text-sm rounded font-medium transition"
                    if (act.style === 'primary') baseClass += " text-white bg-green-600 hover:bg-green-700"
                    else if (act.style === 'secondary') baseClass += " text-gray-400 border border-gray-700 hover:bg-gray-800"
                    else if (act.style === 'danger') baseClass += " text-red-400 border border-red-900/30 hover:bg-red-900/20"
                    else if (act.style === 'warning') baseClass += " text-yellow-300 border border-yellow-900/30 hover:bg-yellow-900/20"
                    else baseClass += " text-gray-400 hover:text-white bg-transparent" // ghost

                    return (
                        <button
                            key={act.key}
                            onClick={() => {
                                if (act.confirm && !confirm(`${act.confirm.title}\n${act.confirm.message}`)) {
                                    return
                                }
                                const payload = evaluateExpression(act.action.payload_expr, evalCtx, {})
                                onAction(act.action.event, payload)
                            }}
                            className={baseClass}
                        >
                            {act.label || `${act.icon || ''} ${act.key}`}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

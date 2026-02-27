import React, { Suspense, useMemo } from 'react'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'

// Auto-discover per-workflow card components (versioned)
const cardModules = import.meta.glob<any>('../../../workflows/*/v*/card.tsx')

// Build registry: workflowId → lazy factory (latest version wins)
const CARD_REGISTRY: Record<string, () => Promise<any>> = {}
for (const [path, factory] of Object.entries(cardModules)) {
    const match = path.match(/workflows\/([^/]+)\/v[^/]+\/card\.tsx$/)
    if (match) {
        CARD_REGISTRY[match[1]] = factory
    }
}

// Cache lazy components
const LAZY_CACHE: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {}
function getCardComponent(workflowId: string): React.LazyExoticComponent<React.ComponentType<any>> | null {
    if (LAZY_CACHE[workflowId]) return LAZY_CACHE[workflowId]
    const factory = CARD_REGISTRY[workflowId]
    if (!factory) return null
    LAZY_CACHE[workflowId] = React.lazy(factory)
    return LAZY_CACHE[workflowId]
}

export interface CampaignCardProps {
    campaign: any
    onAction: (event: string, payload: any) => void
}

export function CampaignCard({ campaign, onAction }: CampaignCardProps) {
    const workflowId = campaign.workflow_id || 'tiktok-repost'

    // Try per-workflow custom card first
    const CustomCard = getCardComponent(workflowId)
    if (CustomCard) {
        return (
            <Suspense fallback={
                <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse shadow-sm">
                    <span className="text-slate-300">Loading...</span>
                </div>
            }>
                <CustomCard campaign={campaign} onAction={onAction} />
            </Suspense>
        )
    }

    // Fallback: YAML-driven card
    return <YamlDrivenCard campaign={campaign} onAction={onAction} workflowId={workflowId} />
}

// ── Fallback YAML-driven card (light theme, click = detail) ──
function YamlDrivenCard({ campaign, onAction, workflowId }: CampaignCardProps & { workflowId: string }) {
    const { descriptor, loading } = useFlowUIDescriptor(workflowId)

    const config = useMemo(() => {
        return campaign.params || {}
    }, [campaign.params])

    const evalCtx = { campaign, config, hasActiveJobs: campaign.status === 'running' || campaign.status === 'active' }

    if (loading || !descriptor?.campaign_card) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-center animate-pulse shadow-sm">
                <span className="text-slate-300">Loading...</span>
            </div>
        )
    }

    const { campaign_card, card_actions = [] } = descriptor
    const subtitle = evaluateExpression(campaign_card.subtitle_expr, evalCtx, 'Campaign')

    let badge = { label: '• Unknown', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', blink: false }
    if (campaign_card.status_badges) {
        for (const b of campaign_card.status_badges) {
            if (evaluateExpression(b.condition, evalCtx, false)) {
                badge = { ...badge, ...b }
                break
            }
        }
    }

    const stats = (campaign_card.stats || []).map((s: any) => {
        const value = evaluateExpression(s.value_expr, evalCtx, 0)
        const color = s.color_expr ? evaluateExpression(s.color_expr, { ...evalCtx, value }, '#94a3b8') : '#94a3b8'
        const show = s.show_if ? evaluateExpression(s.show_if, evalCtx, true) : true
        return { ...s, value, color, show }
    }).filter((s: any) => s.show)

    const actions = card_actions.filter((a: any) =>
        a.show_if === "true" || evaluateExpression(a.show_if, evalCtx, false)
    )

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onAction('campaign:view-details', { id: campaign.id })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onAction('campaign:view-details', { id: campaign.id }) }}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer flex flex-col gap-3 relative overflow-hidden group shadow-sm"
        >
            <div className="flex justify-between items-start pt-1">
                <h3 className="font-bold text-lg text-slate-800 group-hover:text-purple-700 transition">{campaign.name}</h3>
                <div
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge.blink ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                >{badge.label}</div>
            </div>

            <div className="text-sm text-slate-400">{subtitle}</div>

            <div className="flex items-center text-sm gap-2 mt-1">
                {stats.map((stat: any, idx: number) => (
                    <div key={stat.key} className="flex items-center" title={stat.label}>
                        <span className="mr-1.5">{stat.icon}</span>
                        <span className="font-medium" style={{ color: stat.color }}>{stat.value}</span>
                        {idx < stats.length - 1 && <span className="text-slate-200 mx-2">|</span>}
                    </div>
                ))}
            </div>

            {/* Action buttons — stop propagation so click doesn't navigate */}
            {actions.length > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                    <div className="flex-1" />
                    {actions.map((act: any) => {
                        let cls = "px-4 py-1.5 text-sm rounded-lg font-medium transition cursor-pointer"
                        if (act.style === 'primary') cls += " text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                        else if (act.style === 'danger') cls += " text-red-500 border border-red-200 hover:bg-red-50"
                        else cls += " text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        return (
                            <button key={act.key || act.label} onClick={(e) => {
                                e.stopPropagation()
                                if (act.confirm && !confirm(`${act.confirm.title}\n${act.confirm.message}`)) return
                                const payload = evaluateExpression(act.action.payload_expr, evalCtx, {})
                                onAction(act.action.event, payload)
                            }} className={cls}>{act.label}</button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

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
                <div className="bg-vintage-white border border-vintage-border rounded-2xl p-6 animate-pulse shadow-sm">
                    <span className="text-vintage-gray">Loading...</span>
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
            <div className="bg-vintage-white border border-vintage-border rounded-2xl p-6 flex items-center justify-center animate-pulse shadow-sm">
                <span className="text-vintage-gray">Loading...</span>
            </div>
        )
    }

    const { campaign_card, card_actions = [] } = descriptor
    const subtitle = evaluateExpression(campaign_card.subtitle_expr, evalCtx, 'Campaign')

    let badge = { label: '• Unknown', color: 'var(--ev-c-gray-2)', bg: 'var(--ev-c-gray-3)', blink: false }
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
        const color = s.color_expr ? evaluateExpression(s.color_expr, { ...evalCtx, value }, 'var(--ev-c-gray-2)') : 'var(--ev-c-gray-2)'
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
            className="bg-vintage-white border border-vintage-border rounded-2xl p-6 hover:border-pastel-mint hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col gap-4 relative overflow-hidden group shadow-sm hover:-translate-y-1"
        >
            <div className="flex justify-between items-start">
                <h3 className="font-semibold text-xl text-vintage-charcoal group-hover:text-blue-900 transition-colors">{campaign.name}</h3>
                <div
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full ${badge.blink ? 'animate-pulse' : ''} shadow-sm`}
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                >{badge.label}</div>
            </div>

            <div className="text-sm text-vintage-gray leading-relaxed">{subtitle}</div>

            <div className="flex items-center text-sm gap-3 mt-1">
                {stats.map((stat: any) => (
                    <div key={stat.key} className="flex items-center bg-vintage-cream px-3 py-1.5 rounded-lg border border-vintage-border" title={stat.label}>
                        <span className="mr-2 opacity-70">{stat.icon}</span>
                        <span className="font-medium" style={{ color: stat.color }}>{stat.value}</span>
                    </div>
                ))}
            </div>

            {/* Action buttons — stop propagation so click doesn't navigate */}
            {actions.length > 0 && (
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-vintage-border/50">
                    <div className="flex-1" />
                    {actions.map((act: any) => {
                        let cls = "px-5 py-2 text-sm rounded-full font-medium transition-all duration-200 cursor-pointer active:scale-95 shadow-sm hover:shadow"
                        if (act.style === 'primary') cls += " text-vintage-charcoal bg-pastel-mint cursor-pointer hover:bg-[#c3dac6]"
                        else if (act.style === 'danger') cls += " text-[#a84a4a] border border-[#e2b5b5] bg-[#faebeb] hover:bg-[#f2d8d8]"
                        else cls += " text-vintage-charcoal bg-vintage-cream hover:bg-vintage-border/40 border border-transparent hover:border-vintage-border"
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

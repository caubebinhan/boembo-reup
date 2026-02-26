import React, { Suspense, useMemo } from 'react'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'

// Auto-discover per-workflow card components (versioned)
const cardModules = import.meta.glob<any>('../../../workflows/*/v*/card.tsx')

// Build registry: workflowId → lazy factory (latest version wins)
const CARD_REGISTRY: Record<string, () => Promise<any>> = {}
for (const [path, factory] of Object.entries(cardModules)) {
    // path like ../../../workflows/tiktok-repost/v1.0/card.tsx
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
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 animate-pulse">
                    <span className="text-gray-500">Loading...</span>
                </div>
            }>
                <CustomCard campaign={campaign} onAction={onAction} />
            </Suspense>
        )
    }

    // Fallback: YAML-driven card
    return <YamlDrivenCard campaign={campaign} onAction={onAction} workflowId={workflowId} />
}

// ── Fallback YAML-driven card (original logic) ──
function YamlDrivenCard({ campaign, onAction, workflowId }: CampaignCardProps & { workflowId: string }) {
    const { descriptor, loading } = useFlowUIDescriptor(workflowId)

    const config = useMemo(() => {
        return campaign.params || {}
    }, [campaign.params])

    const evalCtx = { campaign, config, hasActiveJobs: campaign.status === 'running' || campaign.status === 'active' }

    if (loading || !descriptor?.campaign_card) {
        return (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex items-center justify-center animate-pulse">
                <span className="text-gray-500">Loading...</span>
            </div>
        )
    }

    const { campaign_card, card_actions = [] } = descriptor
    const subtitle = evaluateExpression(campaign_card.subtitle_expr, evalCtx, 'Campaign')

    let badge = { label: '• Unknown', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', blink: false }
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
        const color = s.color_expr ? evaluateExpression(s.color_expr, { ...evalCtx, value }, '#9ca3af') : '#9ca3af'
        const show = s.show_if ? evaluateExpression(s.show_if, evalCtx, true) : true
        return { ...s, value, color, show }
    }).filter((s: any) => s.show)

    const actions = card_actions.filter((a: any) =>
        a.show_if === "true" || evaluateExpression(a.show_if, evalCtx, false)
    )

    return (
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition flex flex-col gap-3 relative overflow-hidden">
            <div className="flex justify-between items-start pt-1">
                <h3 className="font-semibold text-lg text-white">{campaign.name}</h3>
                <div
                    className={`text-xs font-semibold px-2 py-1 rounded-md ${badge.blink ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                >{badge.label}</div>
            </div>

            <div className="text-sm text-gray-400">{subtitle}</div>

            <div className="flex items-center text-sm gap-2 mt-1">
                {stats.map((stat: any, idx: number) => (
                    <div key={stat.key} className="flex items-center" title={stat.label}>
                        <span className="mr-1.5">{stat.icon}</span>
                        <span className="font-medium" style={{ color: stat.color }}>{stat.value}</span>
                        {idx < stats.length - 1 && <span className="text-gray-700 mx-2">|</span>}
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 mt-3 pt-4 border-t border-gray-800">
                <button
                    onClick={() => onAction('campaign:view-details', { id: campaign.id })}
                    className="text-gray-400 hover:text-white px-3 py-1.5 text-sm rounded bg-transparent transition"
                >Details →</button>
                <div className="flex-1" />
                {actions.map((act: any) => {
                    let cls = "px-4 py-1.5 text-sm rounded font-medium transition"
                    if (act.style === 'primary') cls += " text-white bg-green-600 hover:bg-green-700"
                    else if (act.style === 'danger') cls += " text-red-400 border border-red-900/30 hover:bg-red-900/20"
                    else cls += " text-gray-400 hover:text-white"
                    return (
                        <button key={act.key || act.label} onClick={() => {
                            if (act.confirm && !confirm(`${act.confirm.title}\n${act.confirm.message}`)) return
                            const payload = evaluateExpression(act.action.payload_expr, evalCtx, {})
                            onAction(act.action.event, payload)
                        }} className={cls}>{act.label}</button>
                    )
                })}
            </div>
        </div>
    )
}

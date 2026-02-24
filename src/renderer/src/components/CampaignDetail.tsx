import { useEffect, useState, useMemo, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../store/store'
import { setJobsForCampaign } from '../store/nodeEventsSlice'
import { InteractionBadge } from './InteractionBadge'
import { NodeStatusGrid } from './NodeStatusGrid'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'
import { getDetailComponent } from './DetailComponentRegistry'

interface CampaignDetailProps {
    campaignId: string
    onBack: () => void
}

export function CampaignDetail({ campaignId, onBack }: CampaignDetailProps) {
    const dispatch = useDispatch()
    const [campaign, setCampaign] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

    const workflowId = campaign?.workflow_id || 'tiktok-repost'
    const { descriptor } = useFlowUIDescriptor(workflowId)

    const config = useMemo(() => {
        if (!campaign?.params) return {}
        try { return typeof campaign.params === 'string' ? JSON.parse(campaign.params) : campaign.params }
        catch { return {} }
    }, [campaign?.params])

    const hasActiveJobs = useSelector((state: RootState) => {
        const stats = state.nodeEvents.byCampaign[campaignId]?.nodeStats || {}
        return Object.values(stats).some(s => s.running > 0 || s.pending > 0)
    })

    const fetchCampaign = useCallback(async () => {
        try {
            // @ts-ignore
            const data = await window.api.invoke('campaign:get', { id: campaignId })
            if (data) setCampaign(data)
        } catch (err) { console.error(err) }
        finally { setLoading(false) }
    }, [campaignId])

    const fetchJobs = useCallback(async () => {
        try {
            // @ts-ignore
            const jobs = await window.api.invoke('campaign:get-jobs', { id: campaignId })
            dispatch(setJobsForCampaign({ campaignId, jobs }))
        } catch (err) { console.error(err) }
    }, [campaignId, dispatch])

    useEffect(() => {
        fetchCampaign()
        fetchJobs()
        const timer = setInterval(() => { fetchCampaign(); fetchJobs() }, 3000)
        return () => clearInterval(timer)
    }, [fetchCampaign, fetchJobs])

    // Initialize collapsed state from descriptor sections
    useEffect(() => {
        const sections = descriptor?.detail_page?.sections || []
        const initial: Record<string, boolean> = {}
        sections.forEach((s: any) => { if (s.collapsed) initial[s.id] = true })
        setCollapsedSections(initial)
    }, [descriptor])

    if (loading || !campaign) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-900">
                <div className="text-gray-500 animate-pulse">Loading campaign...</div>
            </div>
        )
    }

    const evalCtx = { campaign, config, hasActiveJobs }
    const detailPage = descriptor?.detail_page || {}
    const headerStats = detailPage?.header_stats || []
    const headerActions = detailPage?.header_actions || []
    const sections = detailPage?.sections || []

    const statusColors: Record<string, string> = {
        idle: '#6b7280', active: '#10b981', paused: '#eab308',
        finished: '#3b82f6', needs_captcha: '#f97316', error: '#ef4444'
    }

    const handleAction = async (event: string, payload: any) => {
        try {
            // @ts-ignore
            await window.api.invoke(event, payload)
            setTimeout(() => { fetchCampaign(); fetchJobs() }, 500)
        } catch (err) { console.error('Action failed:', err) }
    }

    const toggleSection = (id: string) => {
        setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
    }

    return (
        <div className="flex-1 flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
            {/* HEADER */}
            <div className="border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm z-10">
                <div className="px-6 pt-4 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="text-gray-400 hover:text-white transition p-1.5 rounded-lg hover:bg-gray-800">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-white">{campaign.name}</h2>
                            <p className="text-xs text-gray-500 mt-0.5">{workflowId} • {new Date(campaign.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                            backgroundColor: `${statusColors[campaign.status] || '#6b7280'}20`,
                            color: statusColors[campaign.status] || '#6b7280'
                        }}>{campaign.status}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <InteractionBadge campaignId={campaignId} />

                        {/* YAML-driven action buttons */}
                        {headerActions.map((act: any) => {
                            const show = act.show_if ? evaluateExpression(act.show_if, evalCtx, false) : true
                            if (!show) return null
                            const isLoading = act.loading_if ? evaluateExpression(act.loading_if, evalCtx, false) : false

                            const styles: Record<string, string> = {
                                primary: 'text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20',
                                secondary: 'text-gray-300 border border-gray-700 hover:bg-gray-800',
                                danger: 'text-red-400 border border-red-900/30 hover:bg-red-900/20',
                            }

                            return (
                                <button
                                    key={act.key}
                                    onClick={() => handleAction(act.action.event, evaluateExpression(act.action.payload_expr, evalCtx, {}))}
                                    className={`px-4 py-2 text-sm rounded-lg font-medium transition flex items-center gap-1.5 ${styles[act.style] || 'text-gray-400 hover:text-white'}`}
                                    disabled={isLoading}
                                >
                                    <span>{isLoading ? '⏳' : act.icon}</span>
                                    {act.label?.replace(act.icon || '', '').trim()}
                                </button>
                            )
                        })}

                        {/* Fallback Run button */}
                        {campaign.status === 'idle' && (
                            <button
                                onClick={() => handleAction('trigger-campaign', { id: campaign.id })}
                                className="px-4 py-2 text-sm rounded-lg font-medium transition text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 flex items-center gap-1.5"
                            >🚀 Run Now</button>
                        )}
                    </div>
                </div>

                {/* Header stats */}
                {headerStats.length > 0 && (
                    <div className="px-6 pb-3 flex items-center gap-6">
                        {headerStats.map((stat: any) => (
                            <div key={stat.key} className="flex items-center gap-2">
                                <span className="text-sm">{stat.icon}</span>
                                <span className="text-xs text-gray-500">{stat.label}</span>
                                <span className="text-sm font-bold text-white">{stat.value_expr ? evaluateExpression(stat.value_expr, evalCtx, 0) : 0}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {/* Sections from YAML */}
                {sections.map((section: any) => {
                    const show = section.show_if ? evaluateExpression(section.show_if, evalCtx, true) : true
                    if (!show) return null
                    const isCollapsed = collapsedSections[section.id] ?? false

                    let SectionComponent: React.FC<any> | null = null
                    if (section.component === 'NodePipelineView') {
                        SectionComponent = () => <NodeStatusGrid campaignId={campaignId} campaign={campaign} workflowId={workflowId} />
                    } else {
                        SectionComponent = getDetailComponent(section.component)
                    }

                    return (
                        <div key={section.id} className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
                            <button onClick={() => toggleSection(section.id)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition">
                                <div className="flex items-center gap-2">
                                    <span>{section.icon || '📋'}</span>
                                    <span className="font-medium text-white text-sm">{section.title}</span>
                                </div>
                                <span className="text-gray-500 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                            </button>
                            {!isCollapsed && SectionComponent && (
                                <div className="px-5 pb-5 pt-1">
                                    <SectionComponent campaignId={campaignId} campaign={campaign} workflowId={workflowId} />
                                </div>
                            )}
                            {!isCollapsed && !SectionComponent && (
                                <div className="px-5 pb-5 pt-1 text-gray-600 text-sm">Component "{section.component}" not registered</div>
                            )}
                        </div>
                    )
                })}

                {/* Fallback if no sections */}
                {sections.length === 0 && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
                        <NodeStatusGrid campaignId={campaignId} campaign={campaign} workflowId={workflowId} />
                    </div>
                )}
            </div>
        </div>
    )
}

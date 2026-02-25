import { useEffect, useState, useMemo, useCallback, Suspense, Component, ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../store/store'
import { setJobsForCampaign } from '../store/nodeEventsSlice'
import { InteractionBadge } from './InteractionBadge'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'
import { getWorkflowDetailComponent } from '../detail/WorkflowDetailRegistry'

// ── ErrorBoundary for lazy detail views ──────────
interface EBState { hasError: boolean; error?: Error }
class DetailErrorBoundary extends Component<{ children: ReactNode; workflowId: string }, EBState> {
    state: EBState = { hasError: false }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
    componentDidCatch(error: Error, info: any) {
        console.error('[DetailErrorBoundary] Caught error in detail view:', error, info)
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
                    <p className="text-red-400 font-semibold mb-2">⚠ Detail View Error</p>
                    <p className="text-red-400/70 text-sm mb-3">{this.state.error?.message || 'Unknown error'}</p>
                    <p className="text-gray-600 text-xs">Workflow: {this.props.workflowId}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="mt-3 px-4 py-1.5 text-sm rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition"
                    >Retry</button>
                </div>
            )
        }
        return this.props.children
    }
}

interface CampaignDetailProps {
    campaignId: string
    onBack: () => void
}

export function CampaignDetail({ campaignId, onBack }: CampaignDetailProps) {
    const dispatch = useDispatch()
    const [campaign, setCampaign] = useState<any>(null)
    const [loading, setLoading] = useState(true)

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
        } catch (err) { console.error('[CampaignDetail] fetchCampaign error:', err) }
        finally { setLoading(false) }
    }, [campaignId])

    const fetchJobs = useCallback(async () => {
        try {
            // @ts-ignore
            const jobs = await window.api.invoke('campaign:get-jobs', { id: campaignId })
            dispatch(setJobsForCampaign({ campaignId, jobs }))
        } catch (err) { console.error('[CampaignDetail] fetchJobs error:', err) }
    }, [campaignId, dispatch])

    useEffect(() => {
        console.log(`[CampaignDetail] Loading campaign ${campaignId}`)
        fetchCampaign()
        fetchJobs()
        const timer = setInterval(() => { fetchCampaign(); fetchJobs() }, 3000)
        return () => clearInterval(timer)
    }, [fetchCampaign, fetchJobs])

    if (loading || !campaign) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-900">
                <div className="text-gray-500 animate-pulse">Loading campaign...</div>
            </div>
        )
    }

    console.log(`[CampaignDetail] Rendering campaign ${campaign.name}, workflow=${workflowId}, status=${campaign.status}`)

    const evalCtx = { campaign, config, hasActiveJobs }
    const detailPage = descriptor?.detail_page || {}
    const headerStats = detailPage?.header_stats || []
    const headerActions = detailPage?.header_actions || []

    const statusColors: Record<string, string> = {
        idle: '#6b7280', active: '#10b981', paused: '#eab308',
        finished: '#3b82f6', needs_captcha: '#f97316', error: '#ef4444'
    }

    const handleAction = async (event: string, payload: any) => {
        console.log(`[CampaignDetail] Action: ${event}`, payload)
        try {
            // @ts-ignore
            await window.api.invoke(event, payload)
            setTimeout(() => { fetchCampaign(); fetchJobs() }, 500)
        } catch (err) { console.error('[CampaignDetail] Action failed:', err) }
    }

    // ── Per-workflow detail component (cached lazy) ──
    const WorkflowDetail = getWorkflowDetailComponent(workflowId)

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
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{
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

                        {/* State-aware campaign control buttons */}
                        {['idle', 'finished', 'error'].includes(campaign.status) && (
                            <button
                                onClick={() => handleAction('campaign:trigger', { id: campaign.id })}
                                className="px-4 py-2 text-sm rounded-lg font-medium transition text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 flex items-center gap-1.5"
                            >🚀 Run</button>
                        )}
                        {campaign.status === 'active' && (
                            <button
                                onClick={() => handleAction('campaign:pause', { id: campaign.id })}
                                className="px-4 py-2 text-sm rounded-lg font-medium transition text-amber-300 border border-amber-700 hover:bg-amber-900/30 flex items-center gap-1.5"
                            >⏸ Pause</button>
                        )}
                        {campaign.status === 'paused' && (
                            <button
                                onClick={() => handleAction('campaign:resume', { id: campaign.id })}
                                className="px-4 py-2 text-sm rounded-lg font-medium transition text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 flex items-center gap-1.5"
                            >▶ Resume</button>
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

            {/* CONTENT — Per-workflow detail or fallback */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <DetailErrorBoundary workflowId={workflowId}>
                    {WorkflowDetail ? (
                        <Suspense fallback={
                            <div className="flex items-center justify-center py-12">
                                <div className="text-gray-500 animate-pulse flex items-center gap-2">
                                    <span className="animate-spin">⏳</span> Loading detail view...
                                </div>
                            </div>
                        }>
                            <WorkflowDetail campaignId={campaignId} campaign={campaign} workflowId={workflowId} />
                        </Suspense>
                    ) : (
                        <div className="text-gray-600 text-sm text-center py-12">
                            No detail view registered for workflow "{workflowId}"
                        </div>
                    )}
                </DetailErrorBoundary>
            </div>
        </div>
    )
}

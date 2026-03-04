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
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                    <p className="text-red-600 font-semibold mb-2">⚠ Detail View Error</p>
                    <p className="text-red-500 text-sm mb-3">{this.state.error?.message || 'Unknown error'}</p>
                    <p className="text-slate-400 text-xs">Workflow: {this.props.workflowId}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="mt-3 px-4 py-1.5 text-sm rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition cursor-pointer"
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

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; emoji: string }> = {
    idle: { bg: 'bg-[#f5f3ee]', text: 'text-[#8a827c]', dot: 'bg-[#8a827c]', emoji: '💤' },
    active: { bg: 'bg-[#d4e8d8]', text: 'text-[#2e7d32]', dot: 'bg-[#2e7d32]', emoji: '🌿' },
    paused: { bg: 'bg-[#f9e3d3]', text: 'text-[#8e5a2b]', dot: 'bg-[#8e5a2b]', emoji: '☕' },
    finished: { bg: 'bg-[#d6e4f0]', text: 'text-[#2e5a88]', dot: 'bg-[#2e5a88]', emoji: '🎉' },
    needs_captcha: { bg: 'bg-[#f9e3d3]', text: 'text-[#8e5a2b]', dot: 'bg-[#8e5a2b]', emoji: '🧩' },
    error: { bg: 'bg-[#f4dce0]', text: 'text-[#9e3d4d]', dot: 'bg-[#9e3d4d]', emoji: '🥀' },
}

export function CampaignDetail({ campaignId, onBack }: CampaignDetailProps) {
    const dispatch = useDispatch()
    const [campaign, setCampaign] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [statusMessage, setStatusMessage] = useState<string>('')
    const [actionInFlight, setActionInFlight] = useState<string | null>(null)

    const workflowId = campaign?.workflow_id || 'tiktok-repost'
    const { descriptor } = useFlowUIDescriptor(workflowId)

    const config = useMemo(() => {
        if (!campaign?.params) return {}
        return campaign.params
    }, [campaign?.params])

    const hasActiveJobs = useSelector((state: RootState) => {
        const stats = state.nodeEvents.byCampaign[campaignId]?.nodeStats || {}
        return Object.values(stats).some(s => s.running > 0 || s.pending > 0)
    })

    const fetchCampaign = useCallback(async () => {
        try {
            // @ts-ignore
            const data = await (globalThis as any).api.invoke('campaign:get', { id: campaignId })
            if (data) setCampaign(data)
            // Fetch last log message for inline status display
            try {
                // @ts-ignore
                const logs: any[] = await (globalThis as any).api.invoke('campaign:get-logs', { id: campaignId, limit: 30 }) || []
                const status = data?.status
                let msg = ''
                if (status === 'active') {
                    // Show the latest node:progress message for running campaigns
                    const prog = logs.find(l => l.event === 'node:progress' && l.message)
                    msg = prog?.message || ''
                } else if (status === 'paused') {
                    const ev = logs.find(l => l.event === 'campaign:paused' && l.message)
                    msg = ev?.message || 'Campaign đang tạm dừng'
                } else if (status === 'error') {
                    const ev = logs.find(l => l.event === 'campaign:error' && l.message)
                    msg = ev?.message || ''
                }
                setStatusMessage(msg)
            } catch { }
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
            <div className="flex-1 flex items-center justify-center bg-vintage-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-pastel-pink border-t-pastel-mint rounded-full animate-spin" />
                    <span className="text-vintage-gray text-sm">Loading campaign...</span>
                </div>
            </div>
        )
    }

    console.log(`[CampaignDetail] Rendering campaign ${campaign.name}, workflow=${workflowId}, status=${campaign.status}`)

    const evalCtx = { campaign, config, hasActiveJobs }
    const detailPage = descriptor?.detail_page || {}
    const headerStats = detailPage?.header_stats || []
    const headerActions = detailPage?.header_actions || []
    const ss = STATUS_STYLE[campaign.status] || STATUS_STYLE.idle

    const handleAction = async (event: string, payload: any) => {
        console.log(`[CampaignDetail] Action: ${event}`, payload)
        // Set in-flight for campaign control actions — disables buttons with loading spinner
        const isControlAction = ['campaign:trigger', 'campaign:pause', 'campaign:resume'].includes(event)
        if (isControlAction) setActionInFlight(event)
        try {
            // @ts-ignore
            await window.api.invoke(event, payload)
            setTimeout(() => { fetchCampaign(); fetchJobs() }, 500)
        } catch (err) { console.error('[CampaignDetail] Action failed:', err) }
        finally { if (isControlAction) setActionInFlight(null) }
    }

    // ── Per-workflow detail component (cached lazy, version-aware) ──
    const WorkflowDetail = getWorkflowDetailComponent(workflowId, campaign?.workflow_version)

    return (
        <div className="flex-1 flex flex-col h-screen bg-vintage-white text-vintage-charcoal overflow-hidden">
            {/* HEADER */}
            <div className="border-b border-vintage-border bg-vintage-white/80 backdrop-blur-xl z-10 shadow-sm">
                <div className="px-8 pt-5 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="text-vintage-gray hover:text-vintage-charcoal transition p-2 rounded-full hover:bg-vintage-cream cursor-pointer border border-transparent hover:border-vintage-border">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <div>
                            <h2 className="text-2xl font-semibold text-vintage-charcoal">{campaign.name}</h2>
                            <p className="text-sm text-vintage-gray mt-1 opacity-80">{workflowId} • {new Date(campaign.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${ss.bg} ${ss.text}`}>
                            <span>{ss.emoji}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${ss.dot} ${campaign.status === 'active' ? 'animate-pulse' : ''}`} />
                            {campaign.status}
                        </span>
                        {/* Inline status alert — shown next to the status badge */}
                        {statusMessage && (() => {
                            const alertStyle =
                                campaign.status === 'error' ? 'bg-[#f4dce0] text-[#9e3d4d] border-[#e0a8b0]' :
                                    campaign.status === 'paused' ? 'bg-[#f9e3d3] text-[#8e5a2b] border-[#e0b896]' :
                                        campaign.status === 'needs_captcha' ? 'bg-[#f9e3d3] text-[#8e5a2b] border-[#e0b896]' :
                                            'bg-[#f5f3ee] text-[#5c5551] border-[#e8e4db]'
                            const alertIcon =
                                campaign.status === 'error' ? '🥀 ' :
                                    campaign.status === 'paused' ? '☕ ' :
                                        campaign.status === 'needs_captcha' ? '🧩 ' : ''
                            return (
                                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium max-w-[300px] truncate ${alertStyle}`} title={statusMessage}>
                                    {alertIcon}{statusMessage}
                                </span>
                            )
                        })()}
                    </div>

                    <div className="flex items-center gap-2">
                        <InteractionBadge campaignId={campaignId} />

                        {/* YAML-driven action buttons */}
                        {headerActions.map((act: any) => {
                            const show = act.show_if ? evaluateExpression(act.show_if, evalCtx, false) : true
                            if (!show) return null
                            const isLoading = act.loading_if ? evaluateExpression(act.loading_if, evalCtx, false) : false

                            const styles: Record<string, string> = {
                                primary: 'text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200',
                                secondary: 'text-slate-600 border border-slate-300 hover:bg-slate-50',
                                danger: 'text-red-600 border border-red-200 hover:bg-red-50',
                            }

                            return (
                                <button
                                    key={act.key}
                                    onClick={() => handleAction(act.action.event, evaluateExpression(act.action.payload_expr, evalCtx, {}))}
                                    className={`px-4 py-2 text-sm rounded-xl font-medium transition flex items-center gap-1.5 cursor-pointer ${styles[act.style] || 'text-slate-500 hover:text-slate-700'}`}
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
                                disabled={!!actionInFlight}
                                className="px-4 py-2 text-sm rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: '#d4e8d8', color: '#2e7d32', border: '1px solid #94c8a0' }}
                            >{actionInFlight === 'campaign:trigger' ? '⏳ Starting...' : '🌿 Run'}</button>
                        )}
                        {campaign.status === 'active' && (
                            <button
                                onClick={() => handleAction('campaign:pause', { id: campaign.id })}
                                disabled={!!actionInFlight}
                                className="px-4 py-2 text-sm rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: '#f9e3d3', color: '#8e5a2b', border: '1px solid #e0b896' }}
                            >{actionInFlight === 'campaign:pause' ? '⏳ Pausing...' : '☕ Pause'}</button>
                        )}
                        {campaign.status === 'paused' && (
                            <button
                                onClick={() => handleAction('campaign:resume', { id: campaign.id })}
                                disabled={!!actionInFlight}
                                className="px-4 py-2 text-sm rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: '#d6e4f0', color: '#2e5a88', border: '1px solid #93b4d4' }}
                            >{actionInFlight === 'campaign:resume' ? '⏳ Resuming...' : '🌿 Resume'}</button>
                        )}
                    </div>
                </div>

                {/* Header stats */}
                {headerStats.length > 0 && (
                    <div className="px-8 pb-4 flex items-center gap-6">
                        {headerStats.map((stat: any) => (
                            <div key={stat.key} className="flex items-center gap-2 bg-vintage-cream px-3 py-1.5 rounded-lg border border-vintage-border/50">
                                <span className="text-sm opacity-80">{stat.icon}</span>
                                <span className="text-xs text-vintage-gray font-medium uppercase tracking-wider">{stat.label}</span>
                                <span className="text-sm font-semibold text-vintage-charcoal">{stat.value_expr ? evaluateExpression(stat.value_expr, evalCtx, 0) : 0}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CONTENT — Per-workflow detail or fallback */}
            <div className="flex-1 overflow-y-auto px-8 py-8">
                <DetailErrorBoundary workflowId={workflowId}>
                    {WorkflowDetail ? (
                        <Suspense fallback={
                            <div className="flex items-center justify-center py-12">
                                <div className="flex items-center gap-3 text-vintage-gray">
                                    <div className="w-5 h-5 border-2 border-pastel-pink border-t-pastel-mint rounded-full animate-spin" />
                                    Loading detail view...
                                </div>
                            </div>
                        }>
                            <WorkflowDetail campaignId={campaignId} campaign={campaign} workflowId={workflowId} />
                        </Suspense>
                    ) : (
                        <div className="text-vintage-gray text-sm text-center py-12 bg-vintage-cream/50 rounded-2xl border border-vintage-border">
                            No detail view registered for workflow "{workflowId}"
                        </div>
                    )}
                </DetailErrorBoundary>
            </div>
        </div>
    )
}

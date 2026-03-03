import { useEffect, useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../store/store'

interface NodeStatusGridProps {
    campaignId: string
    campaign: any
    workflowId: string
}

interface FlowNodeInfo {
    node_id: string
    instance_id: string
    children?: string[]
}

interface FlowEdge {
    from: string
    to: string
}

const NODE_ICONS: Record<string, string> = {
    'tiktok.scanner': '🔍',
    'core.deduplicator': '🔄',
    'core.quality_filter': '⭐',
    'core.limit': '🔢',
    'core.downloader': '⬇️',
    'core.caption_gen': '📋',
    'tiktok.publisher': '📤',
    'youtube.publisher': '📺',
    'core.timeout': '⏳',
    'core.loop': '🔁',
}

const NODE_LABELS: Record<string, string> = {
    'tiktok.scanner': 'Scanner',
    'core.deduplicator': 'Dedup',
    'core.quality_filter': 'Quality',
    'core.limit': 'Limit',
    'core.downloader': 'Download',
    'core.caption_gen': 'Caption',
    'tiktok.publisher': 'TikTok',
    'youtube.publisher': 'YouTube',
    'core.timeout': 'Wait',
    'core.loop': 'Loop',
}

function NodeCard({ node, campaignId, size = 'normal' }: { node: FlowNodeInfo, campaignId: string, size?: 'normal' | 'small' }) {
    const stat = useSelector((s: RootState) =>
        s.nodeEvents.byCampaign[campaignId]?.nodeStats?.[node.instance_id] || { pending: 0, running: 0, completed: 0, failed: 0 }
    )
    const activeInfo = useSelector((s: RootState) =>
        s.nodeEvents.activeNodes?.[campaignId]?.[node.instance_id]
    )
    const progressMsg = useSelector((s: RootState) =>
        s.nodeEvents.nodeProgress?.[campaignId]?.[node.instance_id]
    )

    const isRunning = activeInfo?.status === 'running' || stat.running > 0
    const isError = stat.failed > 0
    const isDone = stat.completed > 0 && !isRunning

    let statusColor = '#4b5563'   // idle gray
    if (isRunning) statusColor = '#3b82f6'
    else if (isError) statusColor = '#ef4444'
    else if (isDone) statusColor = '#10b981'

    const icon = NODE_ICONS[node.node_id] || '📦'
    const label = NODE_LABELS[node.node_id] || node.instance_id

    const isSmall = size === 'small'

    return (
        <div
            className={`rounded-xl border transition-all duration-300 ${isSmall ? 'p-2.5 min-w-[110px]' : 'p-3.5 min-w-[140px]'}`}
            style={{
                borderColor: `${statusColor}50`,
                backgroundColor: `${statusColor}10`,
                boxShadow: isRunning ? `0 0 18px ${statusColor}25` : 'none',
            }}
        >
            {/* Running pulse indicator */}
            {isRunning && (
                <div className="h-0.5 rounded-t mb-2 -mt-2.5 -mx-2.5 animate-pulse"
                    style={{ background: `linear-gradient(90deg, transparent, ${statusColor}, transparent)` }} />
            )}

            <div className="flex items-center gap-1.5 mb-1">
                <span className={isRunning ? 'animate-pulse' : ''} style={{ fontSize: isSmall ? '13px' : '14px' }}>
                    {icon}
                </span>
                <span className="font-semibold text-white truncate" style={{ fontSize: isSmall ? '11px' : '12px' }}>
                    {label}
                </span>
                {isRunning && <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ background: statusColor }} />}
            </div>

            {progressMsg && isRunning && (
                <p className="text-xs truncate mt-1 opacity-80" style={{ color: statusColor }}>{progressMsg}</p>
            )}

            <div className="flex gap-2 mt-1.5 text-xs opacity-60 text-gray-400">
                {stat.completed > 0 && <span style={{ color: '#10b981' }}>✓{stat.completed}</span>}
                {stat.pending > 0 && <span style={{ color: '#eab308' }}>…{stat.pending}</span>}
                {stat.failed > 0 && <span style={{ color: '#ef4444' }}>✗{stat.failed}</span>}
            </div>
        </div>
    )
}

export function NodeStatusGrid({ campaignId, workflowId }: NodeStatusGridProps) {
    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[], edges: FlowEdge[] } | null>(null)

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId })
            .then((data: any) => setFlowData(data))
            .catch(console.error)
    }, [workflowId])

    // Build top-level ordered nodes (non-children)
    const { topLevelNodes, childrenSet } = useMemo(() => {
        if (!flowData) return { topLevelNodes: [], childrenSet: new Set<string>() }
        const { nodes } = flowData
        const cs = new Set<string>()
        for (const n of nodes) if (n.children) for (const c of n.children) cs.add(c)
        const tl = nodes.filter(n => !cs.has(n.instance_id))
        return { topLevelNodes: tl, childrenSet: cs }
    }, [flowData])

    // Topological sort of top-level
    const orderedTopLevel = useMemo(() => {
        if (!flowData) return topLevelNodes
        const { edges } = flowData
        const targets = new Set(edges.map(e => e.to))
        const starts = topLevelNodes.filter(n => !targets.has(n.instance_id))
        const edgeMap = new Map<string, string>()
        for (const e of edges) edgeMap.set(e.from, e.to)

        const ordered: FlowNodeInfo[] = []
        const visited = new Set<string>()
        for (const start of starts) {
            let cur: string | undefined = start.instance_id
            while (cur && !visited.has(cur)) {
                visited.add(cur)
                const node = topLevelNodes.find(n => n.instance_id === cur)
                if (node) ordered.push(node)
                cur = edgeMap.get(cur)
            }
        }
        return ordered
    }, [flowData, topLevelNodes])

    if (!flowData) return <div className="text-gray-500 text-sm animate-pulse">Loading pipeline...</div>

    const childNodes = (flowData?.nodes || []).filter(n => childrenSet.has(n.instance_id))

    return (
        <div className="space-y-5">
            {/* Pipeline row */}
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {orderedTopLevel.map((node, idx) => {
                    const isLoopNode = node.children && node.children.length > 0
                    return (
                        <div key={node.instance_id} className="flex items-center gap-0">
                            {isLoopNode ? (
                                /* ── Loop Block ── */
                                <div className="rounded-2xl border border-dashed border-blue-500/40 bg-blue-950/20 p-3 relative">
                                    {/* Loop header */}
                                    <div className="flex items-center gap-2 mb-3 px-1">
                                        <span className="text-blue-400 font-bold text-xs uppercase tracking-widest">🔁 Per Video Loop</span>
                                        <div className="flex-1 h-px bg-blue-500/20" />
                                        <svg className="text-blue-400 opacity-40" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                            <path d="M3 3v5h5" />
                                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                            <path d="M16 21h5v-5" />
                                        </svg>
                                    </div>
                                    {/* Children row */}
                                    <div className="flex items-center gap-0">
                                        {(node.children || []).map((childId, ci) => {
                                            const childNode = childNodes.find(n => n.instance_id === childId)
                                            if (!childNode) return null
                                            return (
                                                <div key={childId} className="flex items-center gap-0">
                                                    <NodeCard node={childNode} campaignId={campaignId} size="small" />
                                                    {ci < (node.children?.length || 0) - 1 && (
                                                        <div className="flex items-center px-1.5">
                                                            <div className="w-5 h-px bg-blue-500/30" />
                                                            <div className="border-t-[3px] border-b-[3px] border-l-4 border-transparent border-l-blue-500/30" style={{ borderTopColor: 'transparent', borderBottomColor: 'transparent' }} />
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {/* Loop-back arrow */}
                                        <div className="ml-2 flex items-center gap-1 opacity-30 text-blue-400 text-xs">
                                            <span>↩</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <NodeCard node={node} campaignId={campaignId} />
                            )}

                            {idx < orderedTopLevel.length - 1 && (
                                <div className="flex items-center px-2">
                                    <div className="w-8 h-px bg-gray-600" />
                                    <div className="w-0 h-0" style={{
                                        borderTop: '5px solid transparent',
                                        borderBottom: '5px solid transparent',
                                        borderLeft: '7px solid #4b5563'
                                    }} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

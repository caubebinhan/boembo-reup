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
    execution: any
}

interface FlowEdge {
    from: string
    to: string
}

// ── Node icons by convention ───────────────────────
const NODE_ICONS: Record<string, string> = {
    'tiktok.scanner': '🔍',
    'core.deduplicator': '🔄',
    'core.quality_filter': '⭐',
    'core.limit': '🔢',
    'core.downloader': '⬇️',
    'core.caption_gen': '📋',
    'tiktok.publisher': '📤',
    'youtube.publisher': '📺',
}

const NODE_LABELS: Record<string, string> = {
    'tiktok.scanner': 'Scanner',
    'core.deduplicator': 'Dedup',
    'core.quality_filter': 'Quality',
    'core.limit': 'Limit',
    'core.downloader': 'Download',
    'core.caption_gen': 'Caption',
    'tiktok.publisher': 'TikTok Pub',
    'youtube.publisher': 'YouTube Pub',
}

export function NodeStatusGrid({ campaignId, workflowId }: NodeStatusGridProps) {
    const nodeStatsMap = useSelector((state: RootState) =>
        state.nodeEvents.byCampaign[campaignId]?.nodeStats || {}
    )
    const activeNodes = useSelector((state: RootState) =>
        state.nodeEvents.activeNodes[campaignId] || {}
    )
    const nodeProgress = useSelector((state: RootState) =>
        state.nodeEvents.nodeProgress[campaignId] || {}
    )

    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[], edges: FlowEdge[] } | null>(null)

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId })
            .then((data: any) => setFlowData(data))
            .catch(console.error)
    }, [workflowId])

    // Topological sort
    const orderedNodes = useMemo(() => {
        if (!flowData) return []
        const { nodes, edges } = flowData
        const targets = new Set(edges.map(e => e.to))
        const starts = nodes.filter(n => !targets.has(n.instance_id))
        const edgeMap = new Map<string, string>()
        for (const e of edges) edgeMap.set(e.from, e.to)

        const ordered: FlowNodeInfo[] = []
        const visited = new Set<string>()
        for (const start of starts) {
            let current: string | undefined = start.instance_id
            while (current && !visited.has(current)) {
                visited.add(current)
                const node = nodes.find(n => n.instance_id === current)
                if (node) ordered.push(node)
                current = edgeMap.get(current)
            }
        }
        return ordered
    }, [flowData])

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>📊</span> Pipeline
            </h3>

            {/* Pipeline flow — horizontal cards connected by arrows */}
            <div className="flex items-start gap-0 overflow-x-auto pb-4">
                {orderedNodes.map((node, idx) => {
                    const stat = nodeStatsMap[node.instance_id] || { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }
                    const activeInfo = activeNodes[node.instance_id]
                    const progressMsg = nodeProgress[node.instance_id]
                    const isActive = activeInfo?.status === 'running' || stat.running > 0

                    let status: 'idle' | 'running' | 'done' | 'error' = 'idle'
                    if (isActive) status = 'running'
                    else if (activeInfo?.status === 'failed' || stat.failed > 0) status = 'error'
                    else if (stat.completed > 0) status = 'done'

                    const icon = NODE_ICONS[node.node_id] || '📦'
                    const label = NODE_LABELS[node.node_id] || node.instance_id

                    return (
                        <div key={node.instance_id} className="flex items-center">
                            {/* Card */}
                            <div className={`rounded-xl border p-4 min-w-[150px] max-w-[190px] transition-all duration-300 ${status === 'running' ? 'border-blue-400 bg-blue-900/15 shadow-[0_0_20px_rgba(96,165,250,0.15)]' :
                                status === 'done' ? 'border-green-500/40 bg-green-900/10' :
                                    status === 'error' ? 'border-red-500/40 bg-red-900/10' :
                                        'border-gray-700 bg-gray-800/50'
                                }`}>
                                {/* Active indicator */}
                                {status === 'running' && (
                                    <div className="h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse mb-3 -mt-1 -mx-1 rounded-t" />
                                )}

                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-sm ${status === 'running' ? 'animate-pulse' : ''}`}>
                                        {status === 'running' ? '🔵' : status === 'done' ? '🟢' : status === 'error' ? '🔴' : '⚪'}
                                    </span>
                                    <span className="text-xs font-semibold uppercase tracking-wider" style={{
                                        color: status === 'running' ? '#60a5fa' : status === 'done' ? '#10b981' : status === 'error' ? '#ef4444' : '#9ca3af'
                                    }}>
                                        {status === 'running' ? 'RUNNING' : status}
                                    </span>
                                </div>

                                <h4 className="font-semibold text-white text-sm mb-1">{icon} {label}</h4>

                                {progressMsg && status === 'running' && (
                                    <p className="text-xs text-blue-300 truncate">{progressMsg}</p>
                                )}

                                <div className="text-xs text-gray-500 mt-1">
                                    ✅ {stat.completed} | ⏳ {stat.pending} | ❌ {stat.failed}
                                </div>
                            </div>

                            {/* Arrow */}
                            {idx < orderedNodes.length - 1 && (
                                <div className="flex items-center px-2">
                                    <div className="w-8 h-px bg-gray-600" />
                                    <div className="w-0 h-0 border-t-4 border-b-4 border-l-[6px] border-t-transparent border-b-transparent border-l-gray-600" />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Summary table */}
            {Object.keys(nodeStatsMap).length > 0 && (
                <div className="rounded-xl border border-gray-800 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-800/50">
                                <th className="text-left px-4 py-2 text-gray-400 font-medium">Node</th>
                                <th className="text-center px-3 py-2 text-gray-400 font-medium">⏳</th>
                                <th className="text-center px-3 py-2 text-gray-400 font-medium">🔵</th>
                                <th className="text-center px-3 py-2 text-gray-400 font-medium">✅</th>
                                <th className="text-center px-3 py-2 text-gray-400 font-medium">❌</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderedNodes.map(node => {
                                const stat = nodeStatsMap[node.instance_id]
                                if (!stat) return null
                                const isRunning = activeNodes[node.instance_id]?.status === 'running'
                                return (
                                    <tr key={node.instance_id} className={`border-t border-gray-800/50 ${isRunning ? 'bg-blue-900/10' : 'hover:bg-gray-800/30'}`}>
                                        <td className="px-4 py-2 text-white text-xs flex items-center gap-2">
                                            {isRunning && <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
                                            <span>{NODE_ICONS[node.node_id] || '📦'}</span>
                                            <span className="font-medium">{NODE_LABELS[node.node_id] || node.instance_id}</span>
                                        </td>
                                        <td className="text-center px-3 py-2 text-yellow-400">{stat.pending}</td>
                                        <td className="text-center px-3 py-2 text-blue-400">{stat.running}</td>
                                        <td className="text-center px-3 py-2 text-green-400">{stat.completed}</td>
                                        <td className="text-center px-3 py-2 text-red-400">{stat.failed}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

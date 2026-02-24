import { useEffect, useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'

interface PipelineVisualizerProps {
    campaignId: string
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

// ── Node Metadata ──────────────────────────────────
const NODE_META: Record<string, { icon: string; label: string; color: string; desc: string }> = {
    'tiktok.scanner': { icon: '🔍', label: 'Scanner', color: '#8b5cf6', desc: 'Scan TikTok sources' },
    'core.file_source': { icon: '📁', label: 'Files', color: '#8b5cf6', desc: 'Load local files' },
    'core.deduplicator': { icon: '🔄', label: 'Dedup', color: '#6366f1', desc: 'Skip duplicates' },
    'core.quality_filter': { icon: '🎯', label: 'Quality', color: '#6366f1', desc: 'Filter low quality' },
    'core.limit': { icon: '🔢', label: 'Limit', color: '#6366f1', desc: 'Limit results' },
    'core.downloader': { icon: '⬇️', label: 'Download', color: '#3b82f6', desc: 'Download video' },
    'core.caption_gen': { icon: '📋', label: 'Caption', color: '#0ea5e9', desc: 'Generate caption' },
    'tiktok.publisher': { icon: '📤', label: 'Publish', color: '#10b981', desc: 'Upload to TikTok' },
    'core.timeout': { icon: '⏳', label: 'Wait', color: '#6b7280', desc: 'Delay between items' },
    'core.loop': { icon: '🔁', label: 'Loop', color: '#3b82f6', desc: 'Process each item' },
}

// ── Individual Node Card ────────────────────────────
function NodeCard({
    node, campaignId, compact = false
}: {
    node: FlowNodeInfo
    campaignId: string
    compact?: boolean
}) {
    const stat = useSelector((s: RootState) =>
        s.nodeEvents.byCampaign[campaignId]?.nodeStats?.[node.instance_id]
        || { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }
    )
    const activeInfo = useSelector((s: RootState) =>
        s.nodeEvents.activeNodes?.[campaignId]?.[node.instance_id]
    )
    const progressMsg = useSelector((s: RootState) =>
        s.nodeEvents.nodeProgress?.[campaignId]?.[node.instance_id]
    )

    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }
    const isRunning = activeInfo?.status === 'running' || stat.running > 0
    const isFailed = stat.failed > 0
    const isDone = stat.completed > 0 && !isRunning
    const isIdle = !isRunning && !isFailed && !isDone

    // Status-dependent styling
    let borderColor = '#1f2937'
    let bgGradient = 'from-gray-900/80 to-gray-900/40'
    let glowShadow = 'none'
    let statusDot = ''
    let statusLabel = ''
    let statusColor = '#6b7280'

    if (isRunning) {
        borderColor = meta.color
        bgGradient = 'from-gray-900/90 to-gray-800/50'
        glowShadow = `0 0 24px ${meta.color}30, 0 0 6px ${meta.color}20`
        statusDot = 'animate-pulse'
        statusLabel = 'RUNNING'
        statusColor = meta.color
    } else if (isFailed) {
        borderColor = '#ef4444'
        bgGradient = 'from-red-950/40 to-gray-900/40'
        statusLabel = 'ERROR'
        statusColor = '#ef4444'
    } else if (isDone) {
        borderColor = '#10b98140'
        bgGradient = 'from-emerald-950/20 to-gray-900/40'
        statusLabel = 'DONE'
        statusColor = '#10b981'
    }

    const cardWidth = compact ? 'min-w-[120px] max-w-[150px]' : 'min-w-[160px] max-w-[200px]'
    const pad = compact ? 'px-3 py-2.5' : 'px-4 py-3'

    return (
        <div
            className={`rounded-xl border ${pad} ${cardWidth} bg-gradient-to-b ${bgGradient} transition-all duration-500 relative overflow-hidden`}
            style={{ borderColor, boxShadow: glowShadow }}
        >
            {/* Running progress bar */}
            {isRunning && (
                <div className="absolute top-0 left-0 right-0 h-[2px]">
                    <div
                        className="h-full rounded-full animate-pulse"
                        style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
                    />
                </div>
            )}

            {/* Header: icon + label + status dot */}
            <div className="flex items-center gap-2 mb-1">
                <span className={`${isRunning ? 'animate-bounce' : ''}`} style={{ fontSize: compact ? 14 : 18 }}>
                    {meta.icon}
                </span>
                <span className="font-bold text-white truncate" style={{ fontSize: compact ? 11 : 13 }}>
                    {meta.label}
                </span>
                {!isIdle && (
                    <span
                        className={`ml-auto w-2 h-2 rounded-full shrink-0 ${statusDot}`}
                        style={{ backgroundColor: statusColor }}
                    />
                )}
            </div>

            {/* Description */}
            {!compact && (
                <p className="text-[10px] text-gray-600 mb-2 truncate">{meta.desc}</p>
            )}

            {/* Stats counters */}
            {stat.total > 0 && (
                <div className="flex items-center gap-2 text-[10px] mb-1">
                    {stat.completed > 0 && (
                        <span className="flex items-center gap-0.5 text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            {stat.completed}
                        </span>
                    )}
                    {stat.running > 0 && (
                        <span className="flex items-center gap-0.5 text-blue-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                            {stat.running}
                        </span>
                    )}
                    {stat.pending > 0 && (
                        <span className="flex items-center gap-0.5 text-yellow-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                            {stat.pending}
                        </span>
                    )}
                    {stat.failed > 0 && (
                        <span className="flex items-center gap-0.5 text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                            {stat.failed}
                        </span>
                    )}
                </div>
            )}

            {/* Status label */}
            {statusLabel && (
                <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                        style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>
                        {statusLabel}
                    </span>
                </div>
            )}

            {/* Progress message */}
            {progressMsg && isRunning && (
                <p className="text-[10px] truncate mt-1.5 opacity-80" style={{ color: meta.color }}>
                    {progressMsg}
                </p>
            )}

            {/* Error message */}
            {activeInfo?.error && (
                <p className="text-[10px] truncate mt-1 text-red-400 bg-red-500/10 rounded px-1 py-0.5">
                    ⚠ {activeInfo.error}
                </p>
            )}
        </div>
    )
}

// ── Arrow Connector ───────────────────────────────
function Arrow({ animated = false }: { animated?: boolean }) {
    return (
        <div className="flex items-center px-1 shrink-0">
            <div className={`w-6 h-px ${animated ? 'bg-blue-500/50' : 'bg-gray-700/60'}`}>
                {animated && (
                    <div className="w-2 h-px bg-blue-400 animate-pulse" />
                )}
            </div>
            <div
                className="w-0 h-0"
                style={{
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderLeft: `6px solid ${animated ? '#3b82f680' : '#37415180'}`,
                }}
            />
        </div>
    )
}

// ── Loop Block ──────────────────────────────────────
function LoopBlock({
    node, childNodes, campaignId
}: {
    node: FlowNodeInfo
    childNodes: FlowNodeInfo[]
    campaignId: string
}) {
    const stat = useSelector((s: RootState) =>
        s.nodeEvents.byCampaign[campaignId]?.nodeStats?.[node.instance_id]
        || { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }
    )
    const isRunning = stat.running > 0
    const isDone = stat.completed > 0 && !isRunning
    const isFailed = stat.failed > 0

    let borderColor = '#3b82f630'
    if (isRunning) borderColor = '#3b82f660'
    else if (isFailed) borderColor = '#ef444440'
    else if (isDone) borderColor = '#10b98140'

    return (
        <div
            className="rounded-2xl border-2 border-dashed p-4 relative transition-all duration-500"
            style={{
                borderColor,
                background: isRunning ? '#1e3a5f10' : '#111827',
                boxShadow: isRunning ? '0 0 30px #3b82f610' : 'none',
            }}
        >
            {/* Loop Header */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <span className={`text-sm ${isRunning ? 'animate-spin' : ''}`}>🔁</span>
                    <span className="text-blue-400/80 font-bold text-[10px] uppercase tracking-[0.12em]">
                        Per Video Loop
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Loop iteration counts */}
                    {stat.total > 0 && (
                        <div className="flex items-center gap-2 text-[10px]">
                            {stat.completed > 0 && <span className="text-green-400">✓{stat.completed}</span>}
                            {stat.running > 0 && <span className="text-blue-400 animate-pulse">▶{stat.running}</span>}
                            {stat.pending > 0 && <span className="text-yellow-500">…{stat.pending}</span>}
                            {stat.failed > 0 && <span className="text-red-400">✗{stat.failed}</span>}
                        </div>
                    )}

                    {/* Loop-back arrow */}
                    <span className="text-blue-400/30 text-xs">↩ repeat</span>
                </div>
            </div>

            {/* Children row */}
            <div className="flex items-center gap-0">
                {childNodes.map((child, ci) => (
                    <div key={child.instance_id} className="flex items-center">
                        <NodeCard node={child} campaignId={campaignId} compact />
                        {ci < childNodes.length - 1 && <Arrow animated={isRunning} />}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Main Pipeline Visualizer ────────────────────────
export function PipelineVisualizer({ campaignId, workflowId }: PipelineVisualizerProps) {
    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[]; edges: FlowEdge[] } | null>(null)

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId })
            .then((data: any) => {
                console.log(`[PipelineVisualizer] Loaded flow: ${data?.nodes?.length || 0} nodes, ${data?.edges?.length || 0} edges`)
                setFlowData(data)
            })
            .catch((err: any) => console.error('[PipelineVisualizer] Failed to load flow:', err))
    }, [workflowId])

    const { ordered, childrenSet, allChildren } = useMemo(() => {
        if (!flowData) return { ordered: [] as FlowNodeInfo[], childrenSet: new Set<string>(), allChildren: [] as FlowNodeInfo[] }
        const { nodes, edges } = flowData

        // Identify children
        const cs = new Set<string>()
        for (const n of nodes) if (n.children) for (const c of n.children) cs.add(c)

        const topLevel = nodes.filter(n => !cs.has(n.instance_id))

        // Topological sort
        const targets = new Set(edges.map(e => e.to))
        const starts = topLevel.filter(n => !targets.has(n.instance_id))
        const edgeMap = new Map<string, string>()
        for (const e of edges) edgeMap.set(e.from, e.to)

        const result: FlowNodeInfo[] = []
        const visited = new Set<string>()
        for (const start of starts) {
            let cur: string | undefined = start.instance_id
            while (cur && !visited.has(cur)) {
                visited.add(cur)
                const node = topLevel.find(n => n.instance_id === cur)
                if (node) result.push(node)
                cur = edgeMap.get(cur)
            }
        }

        return {
            ordered: result,
            childrenSet: cs,
            allChildren: nodes.filter(n => cs.has(n.instance_id)),
        }
    }, [flowData])

    if (!flowData) {
        return (
            <div className="flex items-center gap-2 py-4 text-gray-600 text-sm">
                <span className="animate-spin">⏳</span> Loading pipeline...
            </div>
        )
    }

    return (
        <div className="overflow-x-auto py-2">
            <div className="flex items-stretch gap-0 min-w-max">
                {ordered.map((node, idx) => {
                    const isLoop = node.children && node.children.length > 0

                    // Resolve child nodes in order
                    const resolvedChildren = isLoop
                        ? (node.children || [])
                            .map(cid => allChildren.find(n => n.instance_id === cid))
                            .filter(Boolean) as FlowNodeInfo[]
                        : []

                    return (
                        <div key={node.instance_id} className="flex items-center">
                            {isLoop ? (
                                <LoopBlock node={node} childNodes={resolvedChildren} campaignId={campaignId} />
                            ) : (
                                <NodeCard node={node} campaignId={campaignId} />
                            )}
                            {idx < ordered.length - 1 && <Arrow />}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

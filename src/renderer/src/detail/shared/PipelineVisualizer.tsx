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
    'tiktok.scanner': { icon: '🔍', label: 'Scanner', color: '#8b5cf6', desc: 'Scan TikTok sources for videos' },
    'core.file_source': { icon: '📁', label: 'Files', color: '#8b5cf6', desc: 'Load local video files' },
    'core.deduplicator': { icon: '🔄', label: 'Dedup', color: '#6366f1', desc: 'Skip already-processed videos' },
    'core.quality_filter': { icon: '🎯', label: 'Quality', color: '#6366f1', desc: 'Filter low quality content' },
    'core.limit': { icon: '🔢', label: 'Limit', color: '#6366f1', desc: 'Limit number of results' },
    'core.downloader': { icon: '⬇️', label: 'Download', color: '#3b82f6', desc: 'Download video file to local' },
    'core.caption_gen': { icon: '📋', label: 'Caption', color: '#0ea5e9', desc: 'Generate/transform caption' },
    'tiktok.publisher': { icon: '📤', label: 'Publish', color: '#10b981', desc: 'Upload video to TikTok' },
    'core.timeout': { icon: '⏳', label: 'Wait', color: '#6b7280', desc: 'Delay between items' },
    'core.loop': { icon: '🔁', label: 'Loop', color: '#3b82f6', desc: 'Process each item sequentially' },
}

type NodeStatus = 'idle' | 'running' | 'done' | 'error'

function useNodeStatus(campaignId: string, instanceId: string): {
    status: NodeStatus
    stat: { pending: number; running: number; completed: number; failed: number; total: number }
    progressMsg: string | null
    error: string | null
} {
    const stat = useSelector((s: RootState) =>
        s.nodeEvents.byCampaign[campaignId]?.nodeStats?.[instanceId]
        || { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }
    )
    const activeInfo = useSelector((s: RootState) =>
        s.nodeEvents.activeNodes?.[campaignId]?.[instanceId]
    )
    const progressMsg = useSelector((s: RootState) =>
        s.nodeEvents.nodeProgress?.[campaignId]?.[instanceId]
    ) || null

    const isRunning = activeInfo?.status === 'running' || stat.running > 0
    const isFailed = stat.failed > 0
    const isDone = stat.completed > 0 && !isRunning

    let status: NodeStatus = 'idle'
    if (isRunning) status = 'running'
    else if (isFailed) status = 'error'
    else if (isDone) status = 'done'

    return { status, stat, progressMsg, error: activeInfo?.error || null }
}

// ── Hover Tooltip ──────────────────────────────────
function NodeTooltip({ node, campaignId }: { node: FlowNodeInfo; campaignId: string }) {
    const { status, stat, progressMsg, error } = useNodeStatus(campaignId, node.instance_id)
    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }

    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[200px] max-w-[280px]">
                <div className="flex items-center gap-2 mb-1.5">
                    <span>{meta.icon}</span>
                    <span className="font-bold text-white text-sm">{meta.label}</span>
                    <span className="text-[9px] uppercase font-bold ml-auto px-1.5 py-0.5 rounded"
                        style={{
                            color: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : status === 'done' ? '#10b981' : '#6b7280',
                            backgroundColor: status === 'running' ? `${meta.color}20` : status === 'error' ? '#ef444420' : status === 'done' ? '#10b98120' : '#6b728020'
                        }}>
                        {status}
                    </span>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{meta.desc}</p>
                <p className="text-[10px] text-gray-600 mb-2">ID: {node.instance_id}</p>

                {stat.total > 0 && (
                    <div className="flex gap-3 text-[10px] border-t border-gray-800 pt-1.5 mt-1.5">
                        {stat.completed > 0 && <span className="text-green-400">✓ {stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-400">▶ {stat.running}</span>}
                        {stat.pending > 0 && <span className="text-yellow-500">… {stat.pending}</span>}
                        {stat.failed > 0 && <span className="text-red-400">✗ {stat.failed}</span>}
                    </div>
                )}

                {progressMsg && (
                    <p className="text-[10px] mt-1.5 truncate" style={{ color: meta.color }}>{progressMsg}</p>
                )}

                {error && (
                    <p className="text-[10px] text-red-400 mt-1 bg-red-500/10 rounded px-1.5 py-0.5">⚠ {error}</p>
                )}

                {/* Arrow pointing down */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-gray-900 border-b border-r border-gray-700" />
            </div>
        </div>
    )
}

// ── Individual Node Card ────────────────────────────
function NodeCard({
    node, campaignId, compact = false, isSelected, onSelect, campaignParams
}: {
    node: FlowNodeInfo
    campaignId: string
    compact?: boolean
    isSelected: boolean
    onSelect: (node: FlowNodeInfo) => void
    campaignParams?: any
}) {
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
    const [hovered, setHovered] = useState(false)
    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }

    // Status-dependent styling
    let borderColor = '#1f2937'
    let bgGradient = 'from-gray-900/80 to-gray-900/40'
    let glowShadow = 'none'

    if (status === 'running') {
        borderColor = meta.color
        bgGradient = 'from-gray-900/90 to-gray-800/50'
        glowShadow = `0 0 20px ${meta.color}40, 0 0 8px ${meta.color}25`
    } else if (status === 'error') {
        borderColor = '#ef4444'
        bgGradient = 'from-red-950/40 to-gray-900/40'
    } else if (status === 'done') {
        borderColor = '#10b98150'
        bgGradient = 'from-emerald-950/20 to-gray-900/40'
    }

    if (isSelected) {
        borderColor = '#a855f7'
        glowShadow = '0 0 16px #a855f730'
    }

    const cardWidth = compact ? 'min-w-[100px] max-w-[130px]' : 'min-w-[140px] max-w-[180px]'
    const pad = compact ? 'px-2.5 py-2' : 'px-3.5 py-3'

    // Special: timeout node shows wait time
    const isTimeout = node.node_id === 'core.timeout'
    const waitMinutes = isTimeout ? (campaignParams?.intervalMinutes || campaignParams?.gap_minutes || '?') : null

    return (
        <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            {hovered && <NodeTooltip node={node} campaignId={campaignId} />}

            <div
                onClick={() => onSelect(node)}
                className={`rounded-xl border ${pad} ${cardWidth} bg-gradient-to-b ${bgGradient} transition-all duration-300 cursor-pointer relative overflow-hidden select-none`}
                style={{ borderColor, boxShadow: glowShadow }}
            >
                {/* Running top bar */}
                {status === 'running' && (
                    <div className="absolute top-0 left-0 right-0 h-[2px]">
                        <div className="h-full rounded-full animate-pulse"
                            style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
                        />
                    </div>
                )}

                {/* Icon + Label + Status dot */}
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={status === 'running' ? 'animate-bounce' : ''} style={{ fontSize: compact ? 13 : 16 }}>
                        {meta.icon}
                    </span>
                    <span className="font-bold text-white truncate" style={{ fontSize: compact ? 10 : 12 }}>
                        {meta.label}
                    </span>
                    {status !== 'idle' && (
                        <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${status === 'running' ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : '#10b981' }}
                        />
                    )}
                </div>

                {/* Timeout: show wait time */}
                {isTimeout && waitMinutes && (
                    <p className="text-[10px] text-gray-500 truncate">Wait {waitMinutes} min</p>
                )}

                {/* Stats counters */}
                {!isTimeout && stat.total > 0 && (
                    <div className="flex items-center gap-1.5 text-[9px] mt-0.5">
                        {stat.completed > 0 && <span className="text-green-400">✓{stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-400 animate-pulse">▶{stat.running}</span>}
                        {stat.failed > 0 && <span className="text-red-400">✗{stat.failed}</span>}
                    </div>
                )}

                {/* Progress message */}
                {progressMsg && status === 'running' && (
                    <p className="text-[9px] truncate mt-0.5 opacity-80" style={{ color: meta.color }}>
                        {progressMsg}
                    </p>
                )}

                {/* Done checkmark overlay */}
                {status === 'done' && (
                    <div className="absolute top-1 right-1.5 text-[10px] text-green-400 opacity-60">✓</div>
                )}
                {/* Error X overlay */}
                {status === 'error' && (
                    <div className="absolute top-1 right-1.5 text-[10px] text-red-400">✗</div>
                )}
            </div>
        </div>
    )
}

// ── Arrow between nodes ────────────────────────────
function Arrow({ active = false }: { active?: boolean }) {
    return (
        <div className="flex items-center px-0.5 shrink-0">
            <div className={`w-5 h-px ${active ? 'bg-blue-500/60' : 'bg-gray-700/50'}`}>
                {active && <div className="w-2 h-px bg-blue-400 animate-pulse" />}
            </div>
            <div className="w-0 h-0"
                style={{
                    borderTop: '3px solid transparent',
                    borderBottom: '3px solid transparent',
                    borderLeft: `5px solid ${active ? '#3b82f680' : '#37415150'}`,
                }}
            />
        </div>
    )
}

// ── Right Panel (click to inspect) ────────────────
function InspectPanel({ node, campaignId, onClose }: { node: FlowNodeInfo; campaignId: string; onClose: () => void }) {
    const { status, stat, progressMsg, error } = useNodeStatus(campaignId, node.instance_id)
    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }

    return (
        <div className="w-[260px] border-l border-gray-800 bg-gray-950/80 p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.icon}</span>
                    <span className="font-bold text-white">{meta.label}</span>
                </div>
                <button onClick={onClose} className="text-gray-600 hover:text-white text-xs transition">✕</button>
            </div>

            <p className="text-xs text-gray-500">{meta.desc}</p>

            <div className="text-[10px] text-gray-600 border-t border-gray-800 pt-2">
                <p>Instance: <span className="text-gray-400">{node.instance_id}</span></p>
                <p>Node: <span className="text-gray-400">{node.node_id}</span></p>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
                    style={{
                        color: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : status === 'done' ? '#10b981' : '#6b7280',
                        backgroundColor: status === 'running' ? `${meta.color}15` : status === 'error' ? '#ef444415' : status === 'done' ? '#10b98115' : '#6b728015'
                    }}>
                    {status === 'running' ? '● Running' : status === 'done' ? '✓ Done' : status === 'error' ? '✗ Error' : '○ Idle'}
                </span>
            </div>

            {/* Stats */}
            {stat.total > 0 && (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-gray-900 rounded px-2 py-1.5">
                        <p className="text-gray-600 text-[9px]">Completed</p>
                        <p className="text-green-400 font-bold">{stat.completed}</p>
                    </div>
                    <div className="bg-gray-900 rounded px-2 py-1.5">
                        <p className="text-gray-600 text-[9px]">Running</p>
                        <p className="text-blue-400 font-bold">{stat.running}</p>
                    </div>
                    <div className="bg-gray-900 rounded px-2 py-1.5">
                        <p className="text-gray-600 text-[9px]">Pending</p>
                        <p className="text-yellow-500 font-bold">{stat.pending}</p>
                    </div>
                    <div className="bg-gray-900 rounded px-2 py-1.5">
                        <p className="text-gray-600 text-[9px]">Failed</p>
                        <p className="text-red-400 font-bold">{stat.failed}</p>
                    </div>
                </div>
            )}

            {/* Progress */}
            {progressMsg && (
                <div className="text-[11px] p-2 rounded bg-gray-900 border border-gray-800">
                    <p className="text-gray-600 text-[9px] mb-0.5">Progress</p>
                    <p style={{ color: meta.color }}>{progressMsg}</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="text-[11px] p-2 rounded bg-red-950/30 border border-red-900/30">
                    <p className="text-red-500 text-[9px] mb-0.5">Error</p>
                    <p className="text-red-400">{error}</p>
                </div>
            )}
        </div>
    )
}

// ── Loop Block ──────────────────────────────────────
function LoopBlock({
    node, childNodes, campaignId, selectedId, onSelect, campaignParams
}: {
    node: FlowNodeInfo
    childNodes: FlowNodeInfo[]
    campaignId: string
    selectedId: string | null
    onSelect: (node: FlowNodeInfo) => void
    campaignParams?: any
}) {
    const { status, stat } = useNodeStatus(campaignId, node.instance_id)
    const isRunning = status === 'running'
    const isFailed = status === 'error'
    const isDone = status === 'done'

    let borderColor = '#3b82f625'
    if (isRunning) borderColor = '#3b82f650'
    else if (isFailed) borderColor = '#ef444440'
    else if (isDone) borderColor = '#10b98140'

    return (
        <div
            className="rounded-2xl border-2 border-dashed px-4 py-3 relative transition-all duration-500"
            style={{
                borderColor,
                background: isRunning ? 'rgba(30,58,95,0.08)' : 'transparent',
                boxShadow: isRunning ? '0 0 40px #3b82f608' : 'none',
            }}
        >
            {/* Loop header */}
            <div className="flex items-center justify-between mb-2.5 px-0.5">
                <div className="flex items-center gap-2">
                    <span className={`text-xs ${isRunning ? 'animate-spin' : ''}`}>🔁</span>
                    <span className="text-blue-400/70 font-bold text-[9px] uppercase tracking-[0.12em]">
                        Per Video
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {stat.total > 0 && (
                        <div className="flex items-center gap-2 text-[9px]">
                            {stat.completed > 0 && <span className="text-green-400">✓{stat.completed}</span>}
                            {stat.running > 0 && <span className="text-blue-400 animate-pulse">▶{stat.running}</span>}
                            {stat.pending > 0 && <span className="text-yellow-500">…{stat.pending}</span>}
                            {stat.failed > 0 && <span className="text-red-400">✗{stat.failed}</span>}
                        </div>
                    )}
                    <span className="text-blue-400/25 text-[9px]">↩ repeat</span>
                </div>
            </div>

            {/* Children as a continuous row */}
            <div className="flex items-center gap-0">
                {childNodes.map((child, ci) => (
                    <div key={child.instance_id} className="flex items-center">
                        <NodeCard
                            node={child}
                            campaignId={campaignId}
                            compact
                            isSelected={selectedId === child.instance_id}
                            onSelect={onSelect}
                            campaignParams={campaignParams}
                        />
                        {ci < childNodes.length - 1 && <Arrow active={isRunning} />}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Main Pipeline Visualizer ────────────────────────
export function PipelineVisualizer({ campaignId, workflowId }: PipelineVisualizerProps) {
    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[]; edges: FlowEdge[] } | null>(null)
    const [selectedNode, setSelectedNode] = useState<FlowNodeInfo | null>(null)
    const [campaignParams, setCampaignParams] = useState<any>({})

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId })
            .then((data: any) => setFlowData(data))
            .catch((err: any) => console.error('[PipelineVisualizer] Failed:', err))
    }, [workflowId])

    // Fetch campaign params to pass to nodes (e.g., timeout needs intervalMinutes)
    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get', { id: campaignId })
            .then((data: any) => {
                try {
                    const p = typeof data?.params === 'string' ? JSON.parse(data.params) : data?.params || {}
                    setCampaignParams(p)
                } catch { /* ok */ }
            })
            .catch(() => { /* ok */ })
    }, [campaignId])

    const { ordered, allChildren } = useMemo(() => {
        if (!flowData) return { ordered: [] as FlowNodeInfo[], allChildren: [] as FlowNodeInfo[] }
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
        <div className="flex gap-0">
            {/* Pipeline */}
            <div className="flex-1 overflow-x-auto py-2">
                <div className="flex items-stretch gap-0 min-w-max">
                    {ordered.map((node, idx) => {
                        const isLoop = node.children && node.children.length > 0
                        const resolvedChildren = isLoop
                            ? (node.children || []).map(cid => allChildren.find(n => n.instance_id === cid)).filter(Boolean) as FlowNodeInfo[]
                            : []

                        return (
                            <div key={node.instance_id} className="flex items-center">
                                {isLoop ? (
                                    <LoopBlock
                                        node={node}
                                        childNodes={resolvedChildren}
                                        campaignId={campaignId}
                                        selectedId={selectedNode?.instance_id || null}
                                        onSelect={setSelectedNode}
                                        campaignParams={campaignParams}
                                    />
                                ) : (
                                    <NodeCard
                                        node={node}
                                        campaignId={campaignId}
                                        isSelected={selectedNode?.instance_id === node.instance_id}
                                        onSelect={setSelectedNode}
                                        campaignParams={campaignParams}
                                    />
                                )}
                                {idx < ordered.length - 1 && <Arrow />}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Right inspector panel */}
            {selectedNode && (
                <InspectPanel
                    node={selectedNode}
                    campaignId={campaignId}
                    onClose={() => setSelectedNode(null)}
                />
            )}
        </div>
    )
}

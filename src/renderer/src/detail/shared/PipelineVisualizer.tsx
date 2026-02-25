import { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react'
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
    when?: string
}

const NODE_META: Record<string, { icon: string; label: string; color: string; desc: string }> = {
    'tiktok.scanner': { icon: '🔍', label: 'Scanner', color: '#8b5cf6', desc: 'Scan TikTok sources' },
    'core.file_source': { icon: '📁', label: 'Files', color: '#8b5cf6', desc: 'Load local video files' },
    'core.video_scheduler': { icon: '📋', label: 'Scheduler', color: '#eab308', desc: 'Schedule videos with times' },
    'core.check_in_time': { icon: '⏰', label: 'Time Check', color: '#f59e0b', desc: 'Check active hours window' },
    'core.deduplicator': { icon: '🔄', label: 'Dedup', color: '#6366f1', desc: 'Skip processed videos' },
    'core.quality_filter': { icon: '🎯', label: 'Quality', color: '#6366f1', desc: 'Filter content' },
    'core.limit': { icon: '🔢', label: 'Limit', color: '#6366f1', desc: 'Limit numbers' },
    'core.downloader': { icon: '⬇️', label: 'Download', color: '#3b82f6', desc: 'Download to local' },
    'core.caption_gen': { icon: '📋', label: 'Caption', color: '#0ea5e9', desc: 'Generate caption' },
    'tiktok.publisher': { icon: '📤', label: 'Publish', color: '#ec4899', desc: 'Upload to TikTok' },
    'core.timeout': { icon: '⏳', label: 'Wait', color: '#6b7280', desc: 'Delay between items' },
    'core.loop': { icon: '🔁', label: 'Loop', color: '#3b82f6', desc: 'Process each item' },
    'core.campaign_finish': { icon: '🏁', label: 'Finish', color: '#10b981', desc: 'Finish campaign' },
    'core.condition': { icon: '🔀', label: 'Condition', color: '#f97316', desc: 'Branch on expression' },
    'core.notify': { icon: '🔔', label: 'Notify', color: '#a78bfa', desc: 'Send desktop notification' },
}

type NodeStatus = 'idle' | 'running' | 'done' | 'error'

function useNodeStatus(campaignId: string, instanceId: string) {
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

    const isFailed = activeInfo?.status === 'failed' || stat.failed > 0
    const isRunning = activeInfo?.status === 'running' || stat.running > 0
    const isDone = stat.completed > 0 && !isRunning && !isFailed

    let status: NodeStatus = 'idle'
    if (isFailed) status = 'error'
    else if (isRunning) status = 'running'
    else if (isDone) status = 'done'

    return { status, stat, progressMsg, error: activeInfo?.error || null }
}

function NodeTooltip({ node, campaignId }: { node: FlowNodeInfo; campaignId: string }) {
    const { status, stat, progressMsg, error } = useNodeStatus(campaignId, node.instance_id)
    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }

    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 pointer-events-none w-max">
            <div className="bg-[#0f172a]/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-2xl shadow-black">
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

                {stat.total > 0 && (
                    <div className="flex gap-3 text-[10px] border-t border-white/5 pt-1.5 mt-1.5">
                        {stat.completed > 0 && <span className="text-emerald-400">✓ {stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-400">▶ {stat.running}</span>}
                        {stat.pending > 0 && <span className="text-amber-500">… {stat.pending}</span>}
                        {stat.failed > 0 && <span className="text-rose-400">✗ {stat.failed}</span>}
                    </div>
                )}

                {progressMsg && <p className="text-[10px] mt-1.5 truncate" style={{ color: meta.color }}>{progressMsg}</p>}
                {error && <p className="text-[10px] text-rose-400 mt-1 bg-rose-500/10 rounded px-1.5 py-0.5">⚠ {error}</p>}

                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-[#0f172a] border-b border-r border-white/10" />
            </div>
        </div>
    )
}

function NodeCard({
    node, campaignId, compact = false, isSelected, onSelect, campaignParams
}: {
    node: FlowNodeInfo, campaignId: string, compact?: boolean, isSelected: boolean, onSelect: (node: FlowNodeInfo) => void, campaignParams?: any
}) {
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
    const [hovered, setHovered] = useState(false)
    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }

    let borderColor = 'rgba(255,255,255,0.05)'
    let bgLayer = 'bg-white/5'
    let glow = 'none'

    if (status === 'running') {
        borderColor = meta.color
        bgLayer = 'bg-slate-900/60'
        glow = `0 0 25px ${meta.color}40, inset 0 0 10px ${meta.color}20`
    } else if (status === 'error') {
        borderColor = '#e11d48'
        bgLayer = 'bg-rose-950/30'
        glow = '0 0 15px rgba(225,29,72,0.3)'
    } else if (status === 'done') {
        borderColor = 'rgba(16,185,129,0.3)'
        bgLayer = 'bg-emerald-950/10'
    }

    if (isSelected) borderColor = '#a855f7'

    const isTimeout = node.node_id === 'core.timeout'
    const waitMinutes = isTimeout ? (campaignParams?.intervalMinutes || '?') : null

    return (
        <div className="relative group z-10" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            {hovered && <NodeTooltip node={node} campaignId={campaignId} />}

            <div
                id={`vis-node-${node.instance_id}`}
                onClick={() => onSelect(node)}
                className={`rounded-2xl border backdrop-blur-md transition-all duration-300 cursor-pointer overflow-hidden ${bgLayer} shadow-xl shadow-black/50`}
                style={{
                    borderColor, boxShadow: glow,
                    width: compact ? 120 : 160,
                    padding: compact ? '8px 12px' : '12px 14px',
                    transform: hovered ? 'translateY(-2px)' : 'none'
                }}
            >
                {status === 'running' && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-pulse"
                        style={{ backgroundImage: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }} />
                )}

                <div className="flex items-center gap-2 mb-1">
                    <span className={status === 'running' ? 'animate-bounce drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''} style={{ fontSize: compact ? 14 : 18 }}>
                        {meta.icon}
                    </span>
                    <span className="font-semibold text-white truncate drop-shadow-md" style={{ fontSize: compact ? 10 : 12 }}>
                        {meta.label}
                    </span>
                    {status !== 'idle' && (
                        <span className={`ml-auto w-2 h-2 rounded-full shrink-0 shadow-lg ${status === 'running' ? 'animate-pulse' : ''}`}
                            style={{
                                backgroundColor: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : '#10b981',
                                boxShadow: `0 0 8px ${status === 'running' ? meta.color : status === 'error' ? '#ef4444' : '#10b981'}`
                            }}
                        />
                    )}
                </div>

                {isTimeout && waitMinutes && <p className="text-[9px] text-gray-400 mt-1 font-medium bg-black/20 rounded px-1.5 py-0.5 inline-block border border-white/5">Wait {waitMinutes} min</p>}

                {!isTimeout && stat.total > 0 && (
                    <div className="flex items-center gap-1.5 text-[9px] mt-1 font-medium">
                        {stat.completed > 0 && <span className="text-emerald-400 drop-shadow-sm">✓{stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-400 drop-shadow-sm animate-pulse">▶{stat.running}</span>}
                        {stat.failed > 0 && <span className="text-rose-400 drop-shadow-sm">✗{stat.failed}</span>}
                    </div>
                )}

                {progressMsg && status === 'running' && (
                    <p className="text-[9px] truncate mt-1.5 font-medium" style={{ color: meta.color }}>{progressMsg}</p>
                )}
            </div>
        </div>
    )
}

function LoopBlock({
    node, childNodes, campaignId, selectedId, onSelect, campaignParams
}: {
    node: FlowNodeInfo, childNodes: FlowNodeInfo[], campaignId: string, selectedId: string | null, onSelect: (node: FlowNodeInfo) => void, campaignParams?: any
}) {
    const { status, stat } = useNodeStatus(campaignId, node.instance_id)
    const isRunning = status === 'running'
    const isFailed = status === 'error'
    const isDone = status === 'done'

    let borderColor = 'rgba(56, 189, 248, 0.2)' // sky-400
    if (isRunning) borderColor = 'rgba(56, 189, 248, 0.5)'
    else if (isFailed) borderColor = 'rgba(244, 63, 94, 0.4)' // rose
    else if (isDone) borderColor = 'rgba(16, 185, 129, 0.4)' // emerald

    return (
        <div className="relative mt-8 mb-4 min-w-[350px] z-0">
            {/* Hidden anchor for SvgOverlay incoming arrows — aligns exactly with nodes' vertical center */}
            <div id={`vis-loop-in-${node.instance_id}`} className="absolute left-0 top-0 h-[80px] w-[1px] pointer-events-none" />
            <div id={`vis-loop-out-${node.instance_id}`} className="absolute right-0 top-0 h-[80px] w-[1px] pointer-events-none" />

            {/* The Background Frame (The Loop Border) */}
            <div className="absolute left-0 right-0 top-[40px] h-[160px] rounded-[32px] border-[3px] border-dashed transition-all duration-700 z-0"
                style={{
                    borderColor,
                    background: isRunning ? 'linear-gradient(135deg, rgba(14,165,233,0.05), rgba(15,23,42,0.3))' : 'rgba(15,23,42,0.2)',
                    boxShadow: isRunning ? '0 0 40px rgba(56,189,248,0.1) inset' : 'none',
                }}>

                {/* Animated Glowing Flow Around the Border */}
                {isRunning && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <rect x="0" y="0" width="100%" height="100%" rx="32" fill="none" stroke="#38bdf8" strokeWidth="4"
                            className="animate-[loop-dash_4s_linear_infinite]"
                            strokeDasharray="200 600"
                            filter="url(#glow)" />
                    </svg>
                )}

                {/* Loop Label on Bottom Border */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#0f172a] px-5 py-1.5 rounded-full border border-sky-500/30 font-bold shadow-lg z-20 whitespace-nowrap">
                    <span className={`text-[11px] ${isRunning ? 'animate-spin drop-shadow-[0_0_5px_rgba(56,189,248,0.8)]' : ''}`}>🔁</span>
                    <span className="text-sky-400 text-[10px] uppercase tracking-[0.2em]">Loop: Per Video</span>

                    {stat.total > 0 && (
                        <div className="flex items-center gap-2 text-[10px] ml-2 border-l border-white/10 pl-2">
                            {stat.completed > 0 && <span className="text-emerald-400">✓{stat.completed}</span>}
                            {stat.running > 0 && <span className="text-sky-400 animate-pulse">▶{stat.running}</span>}
                            {stat.pending > 0 && <span className="text-amber-500">⏳{stat.pending}</span>}
                            {stat.failed > 0 && <span className="text-rose-400">✗{stat.failed}</span>}
                        </div>
                    )}
                </div>

                {/* Return Path Inner Label */}
                <div className="absolute bottom-[20px] w-full text-center flex items-center justify-center gap-4 text-sky-500/30 text-[10px] uppercase font-bold tracking-widest pointer-events-none select-none">
                    <span>◀</span> Return to start <span>◀</span>
                </div>
            </div>

            {/* The Nodes Sitting Exactly On the Top Border */}
            <div className="flex items-center gap-[45px] relative z-10 px-[40px] pb-[160px] w-max">
                {childNodes.map((child, i) => (
                    <div key={child.instance_id} className="relative z-10 flex items-center">
                        <NodeCard node={child} campaignId={campaignId} compact isSelected={selectedId === child.instance_id} onSelect={onSelect} campaignParams={campaignParams} />

                        {/* Connection arrow between nodes sitting on the border */}
                        {i < childNodes.length - 1 && (
                            <div className="absolute left-[100%] top-[40px] -translate-y-1/2 w-[45px] flex justify-center text-sky-500/40 text-[10px] pointer-events-none z-0">
                                ▶
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function SvgOverlay({ edges, flowData, containerRef, campaignId }: { edges: FlowEdge[], flowData: { nodes: FlowNodeInfo[] }, containerRef: any, campaignId: string }) {
    const [paths, setPaths] = useState<{ d: string, isRunning: boolean, isError: boolean, isDone: boolean, label?: string, labelX?: number, labelY?: number }[]>([])
    const stats = useSelector((s: RootState) => s.nodeEvents.byCampaign[campaignId]?.nodeStats)
    const active = useSelector((s: RootState) => s.nodeEvents.activeNodes?.[campaignId])

    const updatePaths = () => {
        if (!containerRef.current) return
        const containerRect = containerRef.current.getBoundingClientRect()
        const newPaths: { d: string, isRunning: boolean, isError: boolean, isDone: boolean, label?: string, labelX?: number, labelY?: number }[] = []
        const outgoingBySource = new Map<string, FlowEdge[]>()
        const nodeByInstance = new Map(flowData.nodes.map(n => [n.instance_id, n] as const))

        for (const edge of edges) {
            if (!outgoingBySource.has(edge.from)) outgoingBySource.set(edge.from, [])
            outgoingBySource.get(edge.from)!.push(edge)
        }

        for (const edge of edges) {
            const elFrom =
                document.getElementById(`vis-node-${edge.from}`) ||
                document.getElementById(`vis-loop-out-${edge.from}`) ||
                document.getElementById(`vis-loop-${edge.from}`)
            const elTo =
                document.getElementById(`vis-node-${edge.to}`) ||
                document.getElementById(`vis-loop-in-${edge.to}`) ||
                document.getElementById(`vis-loop-${edge.to}`)

            if (elFrom && elTo) {
                const r1 = elFrom.getBoundingClientRect()
                const r2 = elTo.getBoundingClientRect()

                const x1 = r1.right - containerRect.left
                const y1 = r1.top + r1.height / 2 - containerRect.top
                const x2 = r2.left - containerRect.left
                const y2 = r2.top + r2.height / 2 - containerRect.top

                const siblings = outgoingBySource.get(edge.from) || []
                const branchIndex = siblings.findIndex(e => e.from === edge.from && e.to === edge.to && e.when === edge.when)
                const branchOffset = siblings.length > 1
                    ? (branchIndex - (siblings.length - 1) / 2) * 28
                    : 0

                const c1x = x1 + 40
                const c1y = y1 + branchOffset
                const c2x = x2 - 40
                const c2y = y2 + branchOffset
                const endX = x2 - 10
                const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${y2}`
                const targetId = edge.to
                const sourceNode = nodeByInstance.get(edge.from)
                const isConditionSource = sourceNode?.node_id === 'core.condition'

                const tStat = stats?.[targetId] || { running: 0, completed: 0, failed: 0 }
                const tAct = active?.[targetId]
                const isError = tAct?.status === 'failed' || tStat.failed > 0
                const isRunning = tAct?.status === 'running' || tStat.running > 0
                const isDone = tStat.completed > 0 && !isRunning && !isError

                newPaths.push({
                    d,
                    isRunning,
                    isError,
                    isDone,
                    label: edge.when?.trim() || (isConditionSource && siblings.length > 1 ? 'else' : undefined),
                    labelX: (x1 + x2) / 2,
                    labelY: ((y1 + y2) / 2) + branchOffset - 12
                })
            }
        }
        setPaths(newPaths)
    }

    useLayoutEffect(() => {
        const obs = new ResizeObserver(updatePaths)
        if (containerRef.current) obs.observe(containerRef.current)
        updatePaths()
        return () => obs.disconnect()
    }, [edges, flowData, stats, active])

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
            <defs>
                <marker id="arrow-idle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#4B5563" />
                </marker>
                <marker id="arrow-run" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
                <marker id="arrow-done" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
                </marker>

                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>
            {paths.map((p, i) => {
                const labelW = p.label ? Math.max(48, Math.min(220, p.label.length * 6.4 + 20)) : 0
                return (
                    <g key={i}>
                        <path d={p.d} fill="none" stroke="#374151" strokeWidth="2" markerEnd="url(#arrow-idle)" />

                        {p.isDone && <path d={p.d} fill="none" stroke="#10b981" strokeWidth="2" opacity="0.6" markerEnd="url(#arrow-done)" />}

                        {p.isRunning && (
                            <path d={p.d} fill="none" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrow-run)" filter="url(#glow)" strokeDasharray="6 6" className="animate-[dash_1s_linear_infinite]" />
                        )}

                        {p.isRunning && (
                            <circle r="3" fill="#60a5fa" filter="url(#glow)">
                                <animateMotion dur="2s" repeatCount="indefinite" path={p.d} />
                            </circle>
                        )}

                        {p.label && p.labelX != null && p.labelY != null && (
                            <>
                                <rect
                                    x={p.labelX - (labelW / 2)}
                                    y={p.labelY - 8}
                                    width={labelW}
                                    height="16"
                                    rx="8"
                                    fill="rgba(15,23,42,0.95)"
                                    stroke="rgba(249,115,22,0.35)"
                                />
                                <text
                                    x={p.labelX}
                                    y={p.labelY + 4}
                                    textAnchor="middle"
                                    fontSize="9"
                                    fontWeight="700"
                                    fill="#fb923c"
                                >
                                    {p.label}
                                </text>
                            </>
                        )}
                    </g>
                )
            })}
        </svg>
    )
}

function InspectPanel({ node, campaignId, onClose }: { node: FlowNodeInfo; campaignId: string; onClose: () => void }) {
    const { status, stat, progressMsg, error } = useNodeStatus(campaignId, node.instance_id)
    const meta = NODE_META[node.node_id] || { icon: '📦', label: node.instance_id, color: '#6b7280', desc: '' }

    return (
        <div className="w-[280px] border-l border-white/10 bg-[#0f172a]/90 backdrop-blur-2xl p-5 flex flex-col gap-4 shrink-0 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-20">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">{meta.icon}</span>
                    <span className="font-bold text-white text-base tracking-wide">{meta.label}</span>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white hover:bg-white/10 p-1 rounded transition">✕</button>
            </div>

            <p className="text-xs text-gray-400 font-medium leading-relaxed">{meta.desc}</p>
            <div className="text-[10px] text-gray-500 bg-black/40 p-2.5 rounded-lg border border-white/5 font-mono">
                <p>Instance: <span className="text-gray-300">{node.instance_id}</span></p>
                <p>Node: <span className="text-gray-300">{node.node_id}</span></p>
            </div>

            <span className="text-xs uppercase font-bold px-3 py-1.5 rounded-md inline-block text-center border shadow-inner"
                style={{
                    color: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : status === 'done' ? '#10b981' : '#6b7280',
                    backgroundColor: status === 'running' ? `${meta.color}10` : status === 'error' ? '#ef444410' : status === 'done' ? '#10b98110' : '#6b728010',
                    borderColor: status === 'running' ? `${meta.color}40` : status === 'error' ? '#ef444440' : status === 'done' ? '#10b98140' : '#6b728040'
                }}>
                {status === 'running' ? '● Running' : status === 'done' ? '✓ Done' : status === 'error' ? '✗ Error' : '○ Idle'}
            </span>

            {stat.total > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-gray-400">Done</span><span className="text-emerald-400 font-bold">{stat.completed}</span>
                    </div>
                    <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-gray-400">Run</span><span className="text-blue-400 font-bold">{stat.running}</span>
                    </div>
                    <div className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-gray-400">Wait</span><span className="text-amber-500 font-bold">{stat.pending}</span>
                    </div>
                    <div className="bg-rose-950/20 border border-rose-900/30 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-gray-400">Fail</span><span className="text-rose-400 font-bold">{stat.failed}</span>
                    </div>
                </div>
            )}

            {progressMsg && (
                <div className="text-xs p-3 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
                    <p className="text-gray-500 text-[10px] mb-1 font-bold tracking-wider">LATEST PROGRESS</p>
                    <p style={{ color: meta.color }} className="font-medium animate-pulse">{progressMsg}</p>
                </div>
            )}

            {error && (
                <div className="text-xs p-3 rounded-xl bg-rose-950/40 border border-rose-900/50 shadow-[0_0_15px_rgba(225,29,72,0.1)]">
                    <p className="text-rose-500 text-[10px] mb-1 font-bold tracking-wider">ERROR TRACE</p>
                    <p className="text-rose-300 font-mono break-words leading-tight">{error}</p>
                </div>
            )}
        </div>
    )
}

export function PipelineVisualizer({ campaignId, workflowId }: PipelineVisualizerProps) {
    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[]; edges: FlowEdge[] } | null>(null)
    const [selectedNode, setSelectedNode] = useState<FlowNodeInfo | null>(null)
    const [campaignParams, setCampaignParams] = useState<any>({})
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId })
            .then((data: any) => setFlowData(data))
            .catch((err: any) => console.error('[PipelineVisualizer] Failed:', err))

        // @ts-ignore
        window.api.invoke('campaign:get', { id: campaignId })
            .then((data: any) => setCampaignParams(typeof data?.params === 'string' ? JSON.parse(data.params) : data?.params || {}))
            .catch(() => { /* ok */ })
    }, [workflowId, campaignId])

    const { layers, allChildren } = useMemo(() => {
        if (!flowData) return { layers: [], allChildren: [] }
        const { nodes, edges } = flowData

        const cs = new Set<string>()
        nodes.forEach(n => n.children?.forEach(c => cs.add(c)))

        // Breadth-first level assignment for parallel support
        const topLevel = nodes.filter(n => !cs.has(n.instance_id))
        const targets = new Set(edges.map(e => e.to))
        const starts = topLevel.filter(n => !targets.has(n.instance_id))

        const adj = new Map<string, string[]>()
        edges.forEach(e => {
            if (!adj.has(e.from)) adj.set(e.from, [])
            adj.get(e.from)!.push(e.to)
        })

        const depths = new Map<string, number>()
        const q: { id: string, d: number }[] = starts.map(n => ({ id: n.instance_id, d: 0 }))

        while (q.length > 0) {
            const { id, d } = q.shift()!
            depths.set(id, Math.max(depths.get(id) || 0, d))
                ; (adj.get(id) || []).forEach(nxt => q.push({ id: nxt, d: d + 1 }))
        }

        const maxD = Math.max(...Array.from(depths.values()), 0)
        const levels: FlowNodeInfo[][] = Array.from({ length: maxD + 1 }, () => [])

        topLevel.forEach(n => {
            const d = depths.get(n.instance_id) || 0
            levels[d].push(n)
        })

        return {
            layers: levels,
            allChildren: nodes.filter(n => cs.has(n.instance_id))
        }
    }, [flowData])

    if (!flowData) return <div className="p-10 flex">Loading pipeline...</div>

    return (
        <div className="flex bg-[#0b1121] rounded-2xl border border-gray-800/50 shadow-[inset_0_0_50px_rgba(0,0,0,0.5)] overflow-hidden relative" style={{ minHeight: '350px' }}>
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="flex-1 overflow-x-auto overflow-y-hidden p-8 relative scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                <style>{`
                    @keyframes dash {
                        to { stroke-dashoffset: -12; }
                    }
                    @keyframes slide {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(300%); }
                    }
                    @keyframes loop-dash {
                        from { stroke-dashoffset: 800; }
                        to { stroke-dashoffset: 0; }
                    }
                `}</style>

                <div ref={containerRef} className="flex items-center gap-24 relative min-w-max h-full">
                    {/* SVG overlay for lines */}
                    <SvgOverlay edges={flowData.edges} flowData={flowData} containerRef={containerRef} campaignId={campaignId} />

                    {/* Nodes in BFS layers */}
                    {layers.map((layer, l_idx) => (
                        <div key={l_idx} className="flex flex-col gap-12 relative z-10">
                            {layer.map(node => {
                                const isLoop = node.children && node.children.length > 0
                                const childrenNodes = isLoop
                                    ? node.children!.map(cid => allChildren.find(n => n.instance_id === cid)).filter(Boolean) as FlowNodeInfo[]
                                    : []

                                return isLoop ? (
                                    <LoopBlock
                                        key={node.instance_id}
                                        node={node} childNodes={childrenNodes} campaignId={campaignId}
                                        selectedId={selectedNode?.instance_id || null} onSelect={setSelectedNode} campaignParams={campaignParams}
                                    />
                                ) : (
                                    <NodeCard
                                        key={node.instance_id}
                                        node={node} campaignId={campaignId}
                                        isSelected={selectedNode?.instance_id === node.instance_id} onSelect={setSelectedNode} campaignParams={campaignParams}
                                    />
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {selectedNode && <InspectPanel node={selectedNode} campaignId={campaignId} onClose={() => setSelectedNode(null)} />}
        </div>
    )
}

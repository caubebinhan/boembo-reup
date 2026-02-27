import { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../store/store'
import { updateNodeProgress } from '../../store/nodeEventsSlice'

interface PipelineVisualizerProps {
    readonly campaignId: string
    readonly workflowId: string
    readonly vertical?: boolean
}

interface FlowNodeInfo {
    node_id: string
    instance_id: string
    children?: string[]
    editable_settings?: any
    on_save_event?: string
    icon?: string
    label?: string
    color?: string
    description?: string
}

interface FlowEdge {
    from: string
    to: string
    when?: string
}

const FALLBACK_META = { icon: '📦', label: '', color: '#6b7280', desc: '' }

function nodeMeta(node: FlowNodeInfo) {
    return {
        icon: node.icon || FALLBACK_META.icon,
        label: node.label || node.node_id,
        color: node.color || FALLBACK_META.color,
        desc: node.description || '',
    }
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

// ── Light Theme Tooltip ────────────────────────
function NodeTooltip({ node, campaignId }: { node: FlowNodeInfo; campaignId: string }) {
    const { status, stat, progressMsg, error } = useNodeStatus(campaignId, node.instance_id)
    const meta = nodeMeta(node)

    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 pointer-events-none w-max">
            <div className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl p-3 shadow-xl">
                <div className="flex items-center gap-2 mb-1.5">
                    <span>{meta.icon}</span>
                    <span className="font-bold text-slate-800 text-sm">{meta.label}</span>
                    <span className="text-[9px] uppercase font-bold ml-auto px-1.5 py-0.5 rounded"
                        style={{
                            color: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : status === 'done' ? '#10b981' : '#6b7280',
                            backgroundColor: status === 'running' ? `${meta.color}15` : status === 'error' ? '#ef444415' : status === 'done' ? '#10b98115' : '#6b728015'
                        }}>
                        {status}
                    </span>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">{meta.desc}</p>
                {stat.total > 0 && (
                    <div className="flex gap-3 text-[10px] border-t border-slate-100 pt-1.5 mt-1.5">
                        {stat.completed > 0 && <span className="text-emerald-600">✓ {stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-600">▶ {stat.running}</span>}
                        {stat.pending > 0 && <span className="text-amber-600">… {stat.pending}</span>}
                        {stat.failed > 0 && <span className="text-rose-500">✗ {stat.failed}</span>}
                    </div>
                )}
                {progressMsg && <p className="text-[10px] mt-1.5 truncate" style={{ color: meta.color }}>{progressMsg}</p>}
                {error && <p className="text-[10px] text-rose-500 mt-1 bg-rose-50 rounded px-1.5 py-0.5">⚠ {error}</p>}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-white border-b border-r border-slate-200" />
            </div>
        </div>
    )
}

// ── Light Theme Node Card ──────────────────────
function NodeCard({
    node, campaignId, compact = false, isSelected, onSelect, campaignParams
}: {
    node: FlowNodeInfo, campaignId: string, compact?: boolean, isSelected: boolean, onSelect: (node: FlowNodeInfo) => void, campaignParams?: any
}) {
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
    const [hovered, setHovered] = useState(false)
    const meta = nodeMeta(node)

    let borderColor = '#e2e8f0'
    let bgClass = 'bg-white'

    if (status === 'running') {
        borderColor = meta.color
        bgClass = 'bg-white'
    } else if (status === 'error') {
        borderColor = '#fca5a5'
        bgClass = 'bg-red-50'
    } else if (status === 'done') {
        borderColor = '#86efac'
        bgClass = 'bg-emerald-50/50'
    }
    if (isSelected) borderColor = '#a855f7'

    const isTimeout = node.node_id === 'core.timeout'
    const isBatchNode = ['tiktok.scanner', 'core.file_source', 'core.video_scheduler', 'core.check_in_time', 'core.campaign_finish'].includes(node.node_id)
    const waitMinutes = isTimeout ? (campaignParams?.intervalMinutes || '?') : null
    const showRawStats = !isTimeout && !isBatchNode && stat.total > 0

    return (
        <div className="relative group z-10" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            {hovered && <NodeTooltip node={node} campaignId={campaignId} />}

            {/* Spinning border animation when running */}
            {status === 'running' && (
                <div className="absolute inset-[-3px] rounded-[14px] z-0 pointer-events-none"
                    style={{
                        background: `conic-gradient(${meta.color} 0deg, ${meta.color}44 120deg, transparent 180deg)`,
                        animation: 'node-spin 1.8s linear infinite',
                        borderRadius: '14px',
                    }}
                />
            )}
            <style>{`
                @keyframes node-spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
            `}</style>

            <div
                id={`vis-node-${node.instance_id}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(node)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(node)}
                className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${bgClass} shadow-sm hover:shadow-md z-10`}
                style={{
                    borderColor,
                    width: compact ? 110 : 140,
                    padding: compact ? '6px 10px' : '10px 12px',
                    transform: hovered ? 'translateY(-2px)' : 'none'
                }}
            >
                {status === 'running' && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] animate-pulse"
                        style={{ backgroundImage: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }} />
                )}

                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={status === 'running' ? 'animate-bounce' : ''} style={{ fontSize: compact ? 13 : 16 }}>
                        {meta.icon}
                    </span>
                    <span className="font-semibold text-slate-700 truncate" style={{ fontSize: compact ? 9 : 11 }}>
                        {meta.label}
                    </span>
                    {status !== 'idle' && (
                        <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${status === 'running' ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : '#10b981' }} />
                    )}
                    {node.editable_settings && (
                        <span className="absolute top-0.5 right-1 text-slate-400 text-[9px] opacity-0 group-hover:opacity-100 transition cursor-pointer hover:text-purple-500" title="Configurable">⚙️</span>
                    )}
                </div>

                {isTimeout && waitMinutes && <p className="text-[8px] text-slate-400 mt-0.5 font-medium bg-slate-100 rounded px-1.5 py-0.5 inline-block border border-slate-200">Wait {waitMinutes} min</p>}

                {showRawStats && (
                    <div className="flex items-center gap-1 text-[8px] mt-0.5 font-medium">
                        {stat.completed > 0 && <span className="text-emerald-600">✓{stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-600 animate-pulse">▶{stat.running}</span>}
                        {stat.failed > 0 && <span className="text-rose-500">✗{stat.failed}</span>}
                    </div>
                )}

                {progressMsg && <p className="text-[8px] truncate mt-0.5 font-medium" style={{ color: meta.color }}>{progressMsg}</p>}
                {isBatchNode && !progressMsg && stat.completed > 0 && <p className="text-[8px] mt-0.5 font-medium text-emerald-600">✓ Done</p>}
            </div>
        </div>
    )
}

// ── Loop Block (light theme) ──────────────────
function LoopBlock({
    node, childNodes, campaignId, selectedId, onSelect, campaignParams
}: {
    node: FlowNodeInfo, childNodes: FlowNodeInfo[], campaignId: string, selectedId: string | null, onSelect: (node: FlowNodeInfo) => void, campaignParams?: any
}) {
    const { status, stat } = useNodeStatus(campaignId, node.instance_id)
    const isRunning = status === 'running'
    const isFailed = status === 'error'
    const isDone = status === 'done'

    let borderColor = '#bae6fd' // sky-200
    if (isRunning) borderColor = '#38bdf8'
    else if (isFailed) borderColor = '#fca5a5'
    else if (isDone) borderColor = '#86efac'

    return (
        <div className="relative min-w-[300px] z-0">
            <div id={`vis-loop-in-${node.instance_id}`} className="absolute left-0 top-0 h-[56px] w-[1px] pointer-events-none" />
            <div id={`vis-loop-out-${node.instance_id}`} className="absolute right-0 top-0 h-[56px] w-[1px] pointer-events-none" />

            <div className="absolute left-0 right-0 top-[32px] h-[130px] rounded-[24px] border-[2px] border-dashed transition-all duration-700 z-0"
                style={{
                    borderColor,
                    background: isRunning ? 'linear-gradient(135deg, rgba(56,189,248,0.05), rgba(248,250,252,0.3))' : '#f8fafc',
                    boxShadow: isRunning ? '0 0 20px rgba(56,189,248,0.08) inset' : 'none',
                }}>
                {isRunning && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <rect x="0" y="0" width="100%" height="100%" rx="24" fill="none" stroke="#38bdf8" strokeWidth="2"
                            className="animate-[loop-dash_4s_linear_infinite]" strokeDasharray="150 500" />
                    </svg>
                )}
                <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white px-4 py-1 rounded-full border border-sky-200 font-bold shadow-sm z-20 whitespace-nowrap">
                    <span className={`text-[10px] ${isRunning ? 'animate-spin' : ''}`}>🔁</span>
                    <span className="text-sky-600 text-[9px] uppercase tracking-[0.15em]">Loop{stat.total ? `: ${stat.total} videos` : ': Per Video'}</span>
                    {stat.total > 0 && (
                        <div className="flex items-center gap-1.5 text-[9px] ml-1.5 border-l border-slate-200 pl-1.5">
                            {stat.completed > 0 && <span className="text-emerald-600">✓{stat.completed}</span>}
                            {stat.running > 0 && <span className="text-sky-600 animate-pulse">▶{stat.running}</span>}
                            {stat.pending > 0 && <span className="text-amber-600">⏳{stat.pending}</span>}
                            {stat.failed > 0 && <span className="text-rose-500">✗{stat.failed}</span>}
                        </div>
                    )}
                </div>
                <div className="absolute bottom-[16px] w-full text-center flex items-center justify-center gap-3 text-sky-300 text-[9px] uppercase font-bold tracking-widest pointer-events-none select-none">
                    <span>◀</span> Return <span>◀</span>
                </div>
            </div>

            <div className="flex items-center gap-[35px] relative z-10 px-[30px] pb-[130px] w-max">
                {childNodes.map((child, i) => (
                    <div key={child.instance_id} className="relative z-10 flex items-center">
                        <NodeCard node={child} campaignId={campaignId} compact isSelected={selectedId === child.instance_id} onSelect={onSelect} campaignParams={campaignParams} />
                        {i < childNodes.length - 1 && (
                            <div className="absolute left-[100%] top-[32px] -translate-y-1/2 w-[35px] flex justify-center text-sky-400 text-[10px] pointer-events-none z-0">
                                ▶
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── SVG Edge Overlay (IMPROVED arrow routing) ──────
function SvgOverlay({ edges, flowData, containerRef, campaignId }: { edges: FlowEdge[], flowData: { nodes: FlowNodeInfo[] }, containerRef: any, campaignId: string }) {
    const [paths, setPaths] = useState<{ d: string, isRunning: boolean, isError: boolean, isDone: boolean, label?: string, labelX?: number, labelY?: number }[]>([])
    const stats = useSelector((s: RootState) => s.nodeEvents.byCampaign[campaignId]?.nodeStats)
    const active = useSelector((s: RootState) => s.nodeEvents.activeNodes?.[campaignId])

    const updatePaths = () => {
        if (!containerRef.current) return
        const containerRect = containerRef.current.getBoundingClientRect()
        const newPaths: typeof paths = []
        const outgoingBySource = new Map<string, FlowEdge[]>()
        const nodeByInstance = new Map(flowData.nodes.map(n => [n.instance_id, n] as const))

        for (const edge of edges) {
            if (!outgoingBySource.has(edge.from)) outgoingBySource.set(edge.from, [])
            outgoingBySource.get(edge.from)!.push(edge)
        }

        // Track vertical offset to avoid overlap between edges sharing same source
        const usedYSlots = new Map<string, number>()

        for (const edge of edges) {
            const elFrom = document.getElementById(`vis-node-${edge.from}`) || document.getElementById(`vis-loop-out-${edge.from}`) || document.getElementById(`vis-loop-${edge.from}`)
            const elTo = document.getElementById(`vis-node-${edge.to}`) || document.getElementById(`vis-loop-in-${edge.to}`) || document.getElementById(`vis-loop-${edge.to}`)

            if (!elFrom || !elTo) continue

            const r1 = elFrom.getBoundingClientRect()
            const r2 = elTo.getBoundingClientRect()

            // Use MIDPOINTS of the right/left edges for connection points
            const x1 = r1.right - containerRect.left
            const y1 = r1.top + r1.height / 2 - containerRect.top
            let x2 = r2.left - containerRect.left
            let y2 = r2.top + r2.height / 2 - containerRect.top

            const isBackward = x2 <= x1

            const siblings = outgoingBySource.get(edge.from) || []
            const branchIndex = siblings.findIndex(e => e.to === edge.to && e.when === edge.when)
            const totalBranches = siblings.length
            const sourceNode = nodeByInstance.get(edge.from)
            const isConditionSource = sourceNode?.node_id === 'core.condition'

            let d = ''

            if (isBackward) {
                // Route backward: go down, left, then up to target bottom
                x2 = r2.left + r2.width / 2 - containerRect.left
                y2 = r2.bottom - containerRect.top

                // Unique vertical slot per backward edge to avoid overlap
                const slotKey = `back-${edge.from}`
                const currentSlot = usedYSlots.get(slotKey) || 0
                usedYSlots.set(slotKey, currentSlot + 1)

                const dropY = Math.max(r1.bottom, r2.bottom) - containerRect.top + 30 + (currentSlot * 18)
                // Use smooth cubic bezier for backward routing
                d = `M ${x1} ${y1} C ${x1 + 25} ${y1}, ${x1 + 25} ${dropY}, ${x1} ${dropY} L ${x2} ${dropY} C ${x2} ${dropY}, ${x2} ${y2 + 12}, ${x2} ${y2 + 8}`
            } else {
                // Forward routing — spread branches vertically from shared source
                const gap = Math.min(35, 100 / Math.max(totalBranches, 1))
                const verticalOffset = totalBranches > 1
                    ? (branchIndex - (totalBranches - 1) / 2) * gap
                    : 0

                const hDist = x2 - x1
                const controlDist = Math.max(30, Math.min(hDist / 2.5, 80))

                // Bezier control points offset vertically to splay branches cleanly
                const c1x = x1 + controlDist
                const c1y = y1 + verticalOffset * 0.6
                const c2x = x2 - controlDist
                const c2y = y2

                // End arrow 6px before target to account for arrowhead
                d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2 - 6} ${y2}`
            }

            // Status detection
            const targetId = edge.to
            const tStat = stats?.[targetId] || { running: 0, completed: 0, failed: 0 }
            const tAct = active?.[targetId]
            const isError = tAct?.status === 'failed' || tStat.failed > 0
            const isRunning = tAct?.status === 'running' || tStat.running > 0
            const isDone = tStat.completed > 0 && !isRunning && !isError

            // Label positioning: mid-point of the bezier
            const edgesToSameTarget = siblings.filter(e => e.to === edge.to)
            const branchIndexTarget = edgesToSameTarget.findIndex(e => e.when === edge.when)
            const labelStackOffset = edgesToSameTarget.length > 1 ? (branchIndexTarget - (edgesToSameTarget.length - 1) / 2) * 16 : 0

            let labelX = x1 + (x2 - x1) / 2
            let labelY = ((y1 + y2) / 2) - 10 + labelStackOffset

            if (isBackward) {
                labelX = x1 - 30
                const slotKey2 = `back-${edge.from}`
                const slot = (usedYSlots.get(slotKey2) || 1) - 1
                labelY = Math.max(r1.bottom, r2.bottom) - containerRect.top + 22 + (slot * 18)
            } else if (totalBranches > 1) {
                const vertOffset = (branchIndex - (totalBranches - 1) / 2) * Math.min(35, 100 / Math.max(totalBranches, 1))
                labelY += vertOffset * 0.4
            }

            newPaths.push({
                d, isRunning, isError, isDone,
                label: edge.when?.trim() || (isConditionSource && totalBranches > 1 && branchIndex > 0 ? 'else' : isConditionSource ? 'if' : undefined),
                labelX, labelY
            })
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
                <marker id="arrow-idle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker id="arrow-run" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
                <marker id="arrow-done" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
                </marker>
            </defs>
            {paths.map((p, i) => {
                const labelW = p.label ? Math.max(40, Math.min(160, p.label.length * 6 + 18)) : 0
                return (
                    <g key={i}>
                        {/* Base path */}
                        <path d={p.d} fill="none" stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#arrow-idle)" />
                        {/* Status overlay */}
                        {p.isDone && <path d={p.d} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.5" markerEnd="url(#arrow-done)" />}
                        {p.isRunning && (
                            <path d={p.d} fill="none" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrow-run)" strokeDasharray="5 5" className="animate-[dash_1s_linear_infinite]" />
                        )}
                        {p.isRunning && (
                            <circle r="2.5" fill="#60a5fa">
                                <animateMotion dur="2s" repeatCount="indefinite" path={p.d} />
                            </circle>
                        )}
                        {/* Edge label */}
                        {p.label && p.labelX != null && p.labelY != null && (
                            <>
                                <rect x={p.labelX - (labelW / 2)} y={p.labelY - 7} width={labelW} height="14" rx="7"
                                    fill="white" stroke="#e2e8f0" strokeWidth="1" />
                                <text x={p.labelX} y={p.labelY + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#f97316">
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

// ── Inspect Panel (light theme) ───────────────
function InspectPanel({ node, campaignId, onClose, campaignParams, onParamsUpdate }: {
    node: FlowNodeInfo; campaignId: string; onClose: () => void;
    campaignParams?: any; onParamsUpdate?: (params: any) => void;
}) {
    const { status, stat, progressMsg, error } = useNodeStatus(campaignId, node.instance_id)
    const meta = nodeMeta(node)
    const fields = node.editable_settings?.fields || []
    const [editValues, setEditValues] = useState<Record<string, any>>({})
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (fields.length > 0 && campaignParams) {
            const initial: Record<string, any> = {}
            fields.forEach((f: any) => { initial[f.key] = campaignParams[f.key] ?? f.default ?? '' })
            setEditValues(initial)
        }
    }, [campaignParams, node.instance_id])

    const handleSave = async () => {
        setSaving(true)
        try {
            // @ts-ignore
            const result = await window.api.invoke('campaign:update-params', { id: campaignId, params: editValues })
            if (result?.success && onParamsUpdate) onParamsUpdate(result.params)
            if (node.on_save_event) {
                // @ts-ignore
                await window.api.invoke('campaign:trigger-event', { id: campaignId, event: node.on_save_event, params: editValues })
            }
        } catch (err: any) { console.error('[InspectPanel] Save failed:', err) }
        finally { setSaving(false) }
    }

    return (
        <div className="w-[260px] border-l border-slate-200 bg-white p-4 flex flex-col gap-3 shrink-0 shadow-lg z-20 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                    <span className="text-xl">{meta.icon}</span>
                    <span className="font-bold text-slate-800 text-sm">{meta.label}</span>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded transition cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">{meta.desc}</p>
            <div className="text-[9px] text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-200 font-mono">
                <p>Instance: <span className="text-slate-600">{node.instance_id}</span></p>
                <p>Node: <span className="text-slate-600">{node.node_id}</span></p>
            </div>

            <span className="text-xs uppercase font-bold px-2.5 py-1 rounded-lg inline-block text-center border"
                style={{
                    color: status === 'running' ? meta.color : status === 'error' ? '#ef4444' : status === 'done' ? '#10b981' : '#6b7280',
                    backgroundColor: status === 'running' ? `${meta.color}10` : status === 'error' ? '#fef2f2' : status === 'done' ? '#ecfdf5' : '#f9fafb',
                    borderColor: status === 'running' ? `${meta.color}30` : status === 'error' ? '#fca5a5' : status === 'done' ? '#86efac' : '#e2e8f0'
                }}>
                {status === 'running' ? '● Running' : status === 'done' ? '✓ Done' : status === 'error' ? '✗ Error' : '○ Idle'}
            </span>

            {stat.total > 0 && (
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Done</span><span className="text-emerald-600 font-bold">{stat.completed}</span>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Run</span><span className="text-blue-600 font-bold">{stat.running}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Wait</span><span className="text-amber-600 font-bold">{stat.pending}</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Fail</span><span className="text-rose-500 font-bold">{stat.failed}</span>
                    </div>
                </div>
            )}

            {progressMsg && (
                <div className="text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-slate-400 text-[9px] mb-0.5 font-bold tracking-wider">PROGRESS</p>
                    <p style={{ color: meta.color }} className="font-medium animate-pulse">{progressMsg}</p>
                </div>
            )}

            {error && (
                <div className="text-xs p-2.5 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-red-500 text-[9px] mb-0.5 font-bold tracking-wider">ERROR</p>
                    <p className="text-red-600 font-mono break-words leading-tight">{error}</p>
                </div>
            )}

            {fields.length > 0 && (
                <div className="border-t border-slate-100 pt-2 flex flex-col gap-2">
                    <p className="text-[9px] text-slate-400 font-bold tracking-wider">⚙ SETTINGS</p>
                    {fields.map((field: any) => (
                        <div key={field.key} className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-slate-500 font-medium">{field.label || field.key}</label>
                            {field.description && <p className="text-[8px] text-slate-400">{field.description}</p>}
                            <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:border-purple-400 outline-none transition"
                                value={editValues[field.key] ?? ''}
                                onChange={(e) => setEditValues(prev => ({ ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) || 0 : e.target.value }))}
                            />
                        </div>
                    ))}
                    <button onClick={handleSave} disabled={saving}
                        className="mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition disabled:opacity-50 cursor-pointer">
                        {saving ? '⏳ Saving...' : '💾 Save & Apply'}
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Main PipelineVisualizer ─────────────────────
export function PipelineVisualizer({ campaignId, workflowId, vertical = false }: PipelineVisualizerProps) {
    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[]; edges: FlowEdge[] } | null>(null)
    const [selectedNode, setSelectedNode] = useState<FlowNodeInfo | null>(null)
    const [campaignParams, setCampaignParams] = useState<any>({})
    const containerRef = useRef<HTMLDivElement>(null)
    const dispatch = useDispatch()

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId })
            .then((data: any) => setFlowData(data))
            .catch((err: any) => console.error('[PipelineVisualizer] Failed:', err))

        // @ts-ignore
        window.api.invoke('campaign:get', { id: campaignId })
            .then((data: any) => setCampaignParams(data?.params || {}))
            .catch(() => { })

        // @ts-ignore
        window.api.invoke('campaign:get-node-progress', { id: campaignId })
            .then((logs: { instance_id: string, message: string }[]) => {
                logs.forEach(log => {
                    dispatch(updateNodeProgress({ campaignId, instanceId: log.instance_id, message: log.message }))
                })
            })
            .catch((err: any) => console.error('[PipelineVisualizer] Failed progress:', err))
    }, [workflowId, campaignId, dispatch])

    const { layers, allChildren } = useMemo(() => {
        if (!flowData) return { layers: [], allChildren: [] }
        const { nodes, edges } = flowData

        const cs = new Set<string>()
        nodes.forEach(n => n.children?.forEach(c => cs.add(c)))

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
            const prevDepth = depths.get(id)
            if (prevDepth !== undefined && prevDepth <= d) continue
            depths.set(id, d)
                ; (adj.get(id) || []).forEach(nxt => {
                    const nextDepth = d + 1
                    const knownDepth = depths.get(nxt)
                    if (knownDepth === undefined || nextDepth < knownDepth) {
                        q.push({ id: nxt, d: nextDepth })
                    }
                })
        }

        const maxD = Math.max(...Array.from(depths.values()), 0)
        const levels: FlowNodeInfo[][] = Array.from({ length: maxD + 1 }, () => [])
        topLevel.forEach(n => {
            const d = depths.get(n.instance_id) || 0
            levels[d].push(n)
        })

        return { layers: levels, allChildren: nodes.filter(n => cs.has(n.instance_id)) }
    }, [flowData])

    if (!flowData) return <div className="p-6 flex text-slate-400">Loading pipeline...</div>

    return (
        <div className="flex bg-slate-50 rounded-xl border border-slate-200 overflow-hidden relative" style={{ minHeight: vertical ? '200px' : '280px' }}>
            <div className={`flex-1 p-6 relative ${vertical ? 'overflow-y-auto overflow-x-hidden' : 'overflow-x-auto overflow-y-hidden'}`}>
                <style>{`
                    @keyframes dash {
                        to { stroke-dashoffset: -10; }
                    }
                    @keyframes loop-dash {
                        from { stroke-dashoffset: 700; }
                        to { stroke-dashoffset: 0; }
                    }
                `}</style>

                <div ref={containerRef}
                    className={vertical
                        ? 'flex flex-col gap-8 relative w-full'
                        : 'flex items-center gap-16 relative min-w-max h-full'
                    }
                >
                    <SvgOverlay edges={flowData.edges} flowData={flowData} containerRef={containerRef} campaignId={campaignId} />

                    {layers.map((layer, l_idx) => {
                        const firstNodeId = layer[0]?.instance_id ?? `layer-${l_idx}`
                        return (<div key={firstNodeId} className={vertical
                            ? 'flex flex-row flex-wrap gap-4 relative z-10 justify-center'
                            : 'flex flex-col gap-8 relative z-10'
                        }>
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
                        </div>)
                    })}
                </div>
            </div>

            {selectedNode && <InspectPanel node={selectedNode} campaignId={campaignId} onClose={() => setSelectedNode(null)} campaignParams={campaignParams} onParamsUpdate={(p) => setCampaignParams(p)} />}
        </div>
    )
}

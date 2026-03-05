import { useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../store/store'
import { updateNodeProgress } from '../../store/nodeEventsSlice'
import { getErrorResolution, extractErrorCodeFromMessage } from '@core/troubleshooting/errorResolution'
import { NodeErrorModal } from '../../components/detail/NodeErrorModal'

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

    return {
        status, stat, progressMsg,
        error: activeInfo?.error || null,
        errorCode: activeInfo?.errorCode || null,
        retryable: activeInfo?.retryable || false,
    }
}

// ── Light Theme Tooltip (with rich error actions) ────────────────────────
function NodeTooltip({ node, campaignId, onViewError }: { node: FlowNodeInfo; campaignId: string; onViewError?: () => void }) {
    const { status, stat, progressMsg, error, errorCode, retryable } = useNodeStatus(campaignId, node.instance_id)
    const meta = nodeMeta(node)
    const isError = status === 'error'
    const resolution = isError ? getErrorResolution(errorCode || extractErrorCodeFromMessage(error || '') || undefined) : null
    const [retrying, setRetrying] = useState(false)
    const api = (window as any).api

    const handleRetry = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setRetrying(true)
        try { await api.invoke('pipeline:retry-node', { campaignId, instanceId: node.instance_id }) } catch { }
        setRetrying(false)
    }

    return (
        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 w-max ${isError ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <style>{`
                @keyframes tooltipErrorPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.18); } 50% { box-shadow: 0 0 0 6px transparent; } }
                .tooltip-error-pulse { animation: tooltipErrorPulse 2s ease-in-out infinite; }
            `}</style>
            <div className={`bg-white/95 backdrop-blur-xl border rounded-xl p-3 shadow-xl ${isError ? 'border-red-300 tooltip-error-pulse' : 'border-slate-200'}`}
                style={{ maxWidth: isError ? '280px' : undefined }}>
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

                {/* ── Rich error panel for failed nodes ── */}
                {isError && resolution && (
                    <div className="mt-2 pt-2 border-t border-red-200 space-y-2">
                        {/* Error code + title */}
                        <div className="flex items-center gap-1.5">
                            {errorCode && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">{errorCode}</span>
                            )}
                            <span className="text-[10px] font-bold text-red-600">{resolution.icon} {resolution.userTitle}</span>
                        </div>
                        {/* Compact cause */}
                        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{resolution.cause}</p>
                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 pt-1">
                            {retryable && (
                                <button onClick={handleRetry} disabled={retrying}
                                    className="text-[9px] font-bold px-2.5 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition cursor-pointer disabled:opacity-50">
                                    {retrying ? '⏳' : '🔄'} Thử lại
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); onViewError?.() }}
                                className="text-[9px] font-bold px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition cursor-pointer">
                                📋 Chi tiết
                            </button>
                        </div>
                    </div>
                )}
                {/* Normal error (no resolution) */}
                {isError && !resolution && error && (
                    <p className="text-[10px] text-rose-500 mt-1 bg-rose-50 rounded px-1.5 py-0.5">⚠ {error}</p>
                )}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-white border-b border-r border-slate-200" />
            </div>
        </div>
    )
}

// ── Light Theme Node Card ──────────────────────
function NodeCard({
    node, campaignId, compact = false, isSelected, onSelect, campaignParams, onViewError
}: {
    node: FlowNodeInfo, campaignId: string, compact?: boolean, isSelected: boolean, onSelect: (node: FlowNodeInfo) => void, campaignParams?: any, onViewError?: (node: FlowNodeInfo) => void
}) {
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
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
    const isBatchNode = ['tiktok.scanner', 'core.file_source', 'core.publish_scheduler', 'core.time_gate', 'core.campaign_finish'].includes(node.node_id)
    const waitMinutes = isTimeout ? (campaignParams?.publishIntervalMinutes || '?') : null
    const showRawStats = !isTimeout && !isBatchNode && stat.total > 0

    return (
        <div className="relative group z-10 w-max h-max">
            {/* Settings floating button */}
            {node.editable_settings && (
                <span
                    onClick={(e) => { e.stopPropagation(); onSelect(node); }}
                    className="absolute -top-2 -right-2 text-slate-400 text-[10px] bg-white border border-slate-200 rounded-full w-5 h-5 flex items-center justify-center shadow-sm cursor-pointer hover:text-purple-500 hover:border-purple-300 transition z-40"
                    title="Settings"
                >
                    ⚙️
                </span>
            )}

            {/* Error badge on failed nodes */}
            {status === 'error' && (
                <div className="absolute -top-2 -right-2 z-30 animate-bounce">
                    <button onClick={(e) => { e.stopPropagation(); onViewError?.(node) }}
                        className="w-6 h-6 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:bg-red-600 transition"
                        title="View error details">
                        !
                    </button>
                </div>
            )}

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
                className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${bgClass} shadow-sm hover:shadow-md hover:-translate-y-0.5 z-10`}
                style={{
                    borderColor,
                    width: compact ? 110 : 140,
                    padding: compact ? '6px 10px' : '10px 12px',
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
                </div>

                {isTimeout && waitMinutes && <p className="text-[8px] text-slate-400 mt-0.5 font-medium bg-slate-100 rounded px-1.5 py-0.5 inline-block border border-slate-200">Chờ {waitMinutes} phút</p>}

                {showRawStats && (
                    <div className="flex items-center gap-1 text-[8px] mt-0.5 font-medium">
                        {stat.completed > 0 && <span className="text-emerald-600">✓{stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-600 animate-pulse">▶{stat.running}</span>}
                        {stat.failed > 0 && <span className="text-rose-500">✗{stat.failed}</span>}
                    </div>
                )}

                {progressMsg && <p className="text-[8px] truncate mt-0.5 font-medium" style={{ color: meta.color }}>{progressMsg}</p>}
                {isBatchNode && !progressMsg && stat.completed > 0 && <p className="text-[8px] mt-0.5 font-medium text-emerald-600">✓ Xong</p>}
            </div>

            {/* Hover tooltip with rich fail diagnostics/actions */}
            <div className="hidden group-hover:block">
                <NodeTooltip
                    node={node}
                    campaignId={campaignId}
                    onViewError={() => onViewError?.(node)}
                />
            </div>
        </div>
    )
}

// ── Loop Block (light theme) ──────────────────
function LoopBlock({
    node, childNodes, campaignId, selectedId, onSelect, campaignParams, onViewError
}: {
    node: FlowNodeInfo, childNodes: FlowNodeInfo[], campaignId: string, selectedId: string | null, onSelect: (node: FlowNodeInfo) => void, campaignParams?: any, onViewError?: (node: FlowNodeInfo) => void
}) {
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
    const isRunning = status === 'running'
    const isFailed = status === 'error'
    const isDone = status === 'done'

    let borderColor = '#bae6fd' // sky-200
    if (isRunning) borderColor = '#38bdf8'
    else if (isFailed) borderColor = '#fca5a5'
    else if (isDone) borderColor = '#86efac'

    return (
        <div className="relative min-w-[300px] z-0 flex items-center justify-center py-10 px-[30px]">
            {/* Connection points centered vertically */}
            <div id={`vis-loop-in-${node.instance_id}`} className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] w-[1px] pointer-events-none" />
            <div id={`vis-loop-out-${node.instance_id}`} className="absolute right-0 top-1/2 -translate-y-1/2 h-[1px] w-[1px] pointer-events-none" />

            {/* Loop Dashed Border */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[90px] rounded-[24px] border-[2px] border-dashed transition-all duration-700 z-0"
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
                    <span className="text-sky-600 text-[9px] uppercase tracking-[0.15em]">
                        {progressMsg || (stat.total ? `Vòng lặp: ${stat.total} video` : 'Vòng lặp: Mỗi video')}
                    </span>
                    {stat.total > 0 && (
                        <div className="flex items-center gap-1.5 text-[9px] ml-1.5 border-l border-slate-200 pl-1.5">
                            {stat.completed > 0 && <span className="text-emerald-600">✓{stat.completed}</span>}
                            {stat.running > 0 && <span className="text-sky-600 animate-pulse">▶{stat.running}</span>}
                            {stat.pending > 0 && <span className="text-amber-600">⏳{stat.pending}</span>}
                            {stat.failed > 0 && <span className="text-rose-500">✗{stat.failed}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Nodes inside Loop */}
            <div className="flex items-center gap-[35px] relative z-10 w-max">
                {childNodes.map((child, i) => (
                    <div key={child.instance_id} className="relative z-10 flex items-center">
                        <NodeCard node={child} campaignId={campaignId} compact isSelected={selectedId === child.instance_id} onSelect={onSelect} campaignParams={campaignParams} onViewError={onViewError} />
                        {i < childNodes.length - 1 && (
                            <div className="absolute left-[100%] top-1/2 -translate-y-1/2 w-[35px] flex justify-center text-sky-400 text-[10px] pointer-events-none z-0">
                                ▶
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── SVG Edge Overlay (straight lines, centered on nodes) ──────
function SvgOverlay({ edges, flowData, containerRef, campaignId, vertical }: { edges: FlowEdge[], flowData: { nodes: FlowNodeInfo[] }, containerRef: any, campaignId: string, vertical?: boolean }) {
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

        const usedBackSlots = new Map<string, number>()

        for (const edge of edges) {
            const elFrom = document.getElementById(`vis-node-${edge.from}`) || document.getElementById(`vis-loop-out-${edge.from}`) || document.getElementById(`vis-loop-${edge.from}`)
            const elTo = document.getElementById(`vis-node-${edge.to}`) || document.getElementById(`vis-loop-in-${edge.to}`) || document.getElementById(`vis-loop-${edge.to}`)

            if (!elFrom || !elTo) continue

            const r1 = elFrom.getBoundingClientRect()
            const r2 = elTo.getBoundingClientRect()

            let x1: number, y1: number, x2: number, y2: number

            if (vertical) {
                // Top to bottom
                x1 = r1.left + r1.width / 2 - containerRect.left
                y1 = r1.bottom - containerRect.top
                x2 = r2.left + r2.width / 2 - containerRect.left
                y2 = r2.top - containerRect.top
            } else {
                // Left to right
                x1 = r1.right - containerRect.left
                y1 = r1.top + r1.height / 2 - containerRect.top
                x2 = r2.left - containerRect.left
                y2 = r2.top + r2.height / 2 - containerRect.top
            }

            const isBackward = vertical ? (y2 <= y1) : (x2 <= x1)
            const siblings = outgoingBySource.get(edge.from) || []
            const branchIndex = siblings.findIndex(e => e.to === edge.to && e.when === edge.when)
            const totalBranches = siblings.length
            const sourceNode = nodeByInstance.get(edge.from)
            const isConditionSource = sourceNode?.node_id === 'core.condition'

            let d = ''
            let labelX = 0
            let labelY = 0
            const R = 8 // corner radius for smooth-step

            if (isBackward) {
                // Backward routing
                const slotKey = `back-${edge.from}`
                const slot = usedBackSlots.get(slotKey) || 0
                usedBackSlots.set(slotKey, slot + 1)

                if (vertical) {
                    // Route backward around the right side
                    const rightX = Math.max(r1.right, r2.right) - containerRect.left + 30 + (slot * 20)
                    const srcMidY = r1.top + r1.height / 2 - containerRect.top
                    const tgtMidY = r2.top + r2.height / 2 - containerRect.top
                    // Right from source -> up -> left to target
                    d = [
                        `M ${r1.right - containerRect.left} ${srcMidY}`,
                        `L ${rightX - R} ${srcMidY}`,
                        `Q ${rightX} ${srcMidY}, ${rightX} ${srcMidY - R}`,
                        `L ${rightX} ${tgtMidY + R}`,
                        `Q ${rightX} ${tgtMidY}, ${rightX - R} ${tgtMidY}`,
                        `L ${r2.right - containerRect.left + 6} ${tgtMidY}`
                    ].join(' ')
                    labelX = rightX + 10
                    labelY = (srcMidY + tgtMidY) / 2
                } else {
                    // Backward: smooth-step route below both nodes
                    const botX = r2.left + r2.width / 2 - containerRect.left
                    const botY = r2.bottom - containerRect.top
                    const dropY = Math.max(r1.bottom, r2.bottom) - containerRect.top + 30 + (slot * 20)
                    d = [
                        `M ${x1} ${y1}`,
                        `L ${x1 + 12 - R} ${y1}`,
                        `Q ${x1 + 12} ${y1}, ${x1 + 12} ${y1 + R}`,
                        `L ${x1 + 12} ${dropY - R}`,
                        `Q ${x1 + 12} ${dropY}, ${x1 + 12 - R} ${dropY}`,
                        `L ${botX + R} ${dropY}`,
                        `Q ${botX} ${dropY}, ${botX} ${dropY - R}`,
                        `L ${botX} ${botY + 6}`,
                    ].join(' ')
                    labelX = (x1 + 12 + botX) / 2
                    labelY = dropY - 10
                }
            } else {
                // Forward: n8n style beautiful bezier curve
                const stagger = totalBranches > 1 ? (branchIndex - (totalBranches - 1) / 2) * 20 : 0;

                if (vertical) {
                    if (Math.abs(x1 - x2) < 3) {
                        d = `M ${x1} ${y1} L ${x2} ${y2}`
                    } else {
                        const cpDist = Math.max(Math.abs(y2 - y1) / 2.5, 40);
                        d = `M ${x1} ${y1} C ${x1 + stagger} ${y1 + cpDist}, ${x2 - stagger} ${y2 - cpDist}, ${x2} ${y2}`
                    }
                    labelX = x1 + (x2 - x1) / 2
                    labelY = y1 + (y2 - y1) / 2
                } else {
                    if (Math.abs(y1 - y2) < 3) {
                        d = `M ${x1} ${y1} L ${x2} ${y2}`
                    } else {
                        const cpDist = Math.max(Math.abs(x2 - x1) / 2.5, 40);
                        d = `M ${x1} ${y1} C ${x1 + cpDist + stagger} ${y1}, ${x2 - cpDist - stagger} ${y2}, ${x2} ${y2}`
                    }
                    labelX = x1 + (x2 - x1) / 2
                    labelY = y1 + (y2 - y1) / 2 - 12
                }
            }

            // Status detection
            const targetId = edge.to
            const tStat = stats?.[targetId] || { running: 0, completed: 0, failed: 0 }
            const tAct = active?.[targetId]
            const isError = tAct?.status === 'failed' || tStat.failed > 0
            const isRunning = tAct?.status === 'running' || tStat.running > 0
            const isDone = tStat.completed > 0 && !isRunning && !isError

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
                <marker id="arrow-idle" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker id="arrow-run" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
                <marker id="arrow-done" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
                </marker>
            </defs>
            {paths.map((p, i) => {
                const labelW = p.label ? Math.max(40, Math.min(160, p.label.length * 6 + 18)) : 0
                return (
                    <g key={i}>
                        <path d={p.d} fill="none" stroke="#cbd5e1" strokeWidth="2" markerEnd="url(#arrow-idle)" strokeLinejoin="round" />
                        {p.isDone && <path d={p.d} fill="none" stroke="#10b981" strokeWidth="2" opacity="0.6" markerEnd="url(#arrow-done)" strokeLinejoin="round" />}
                        {p.isRunning && (
                            <path d={p.d} fill="none" stroke="#3b82f6" strokeWidth="2.5" markerEnd="url(#arrow-run)" strokeDasharray="6 4" strokeLinejoin="round" className="animate-[dash_1s_linear_infinite]" />
                        )}
                        {p.isRunning && (
                            <circle r="3" fill="#60a5fa" className="shadow-lg">
                                <animateMotion dur="2s" repeatCount="indefinite" path={p.d} />
                            </circle>
                        )}
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
    const { status, stat, progressMsg, error, errorCode, retryable } = useNodeStatus(campaignId, node.instance_id)
    const meta = nodeMeta(node)
    const fields = node.editable_settings?.fields || []
    const [editValues, setEditValues] = useState<Record<string, any>>({})
    const [saving, setSaving] = useState(false)
    const [retrying, setRetrying] = useState(false)

    const handleRetry = async () => {
        setRetrying(true)
        try {
            // @ts-ignore
            await window.api.invoke('pipeline:retry-node', {
                campaignId, instanceId: node.instance_id,
            })
        } catch (err: any) {
            console.error('[InspectPanel] Retry failed:', err)
        } finally {
            setRetrying(false)
        }
    }

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
                {status === 'running' ? '● Đang chạy' : status === 'done' ? '✓ Xong' : status === 'error' ? '✗ Lỗi' : '○ Chờ'}
            </span>

            {stat.total > 0 && (
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Xong</span><span className="text-emerald-600 font-bold">{stat.completed}</span>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Chạy</span><span className="text-blue-600 font-bold">{stat.running}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Chờ</span><span className="text-amber-600 font-bold">{stat.pending}</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-500">Lỗi</span><span className="text-rose-500 font-bold">{stat.failed}</span>
                    </div>
                </div>
            )}

            {progressMsg && (
                <div className="text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-slate-400 text-[9px] mb-0.5 font-bold tracking-wider">TIẾN ĐỘ</p>
                    <p style={{ color: meta.color }} className="font-medium animate-pulse">{progressMsg}</p>
                </div>
            )}

            {error && (
                <div className="text-xs p-2.5 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-red-500 text-[9px] font-bold tracking-wider">LỖI</p>
                        {errorCode && <span className="text-[8px] font-mono bg-red-100 text-red-600 px-1.5 py-0.5 rounded">{errorCode}</span>}
                    </div>
                    <p className="text-red-600 font-mono break-words leading-tight">{error}</p>
                    {retryable && (
                        <button
                            onClick={handleRetry}
                            disabled={retrying}
                            className="mt-2 w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                            {retrying ? '⏳ Retrying...' : '🔄 Retry This Node'}
                        </button>
                    )}
                </div>
            )}

            {fields.length > 0 && (
                <div className="border-t border-slate-100 pt-2 flex flex-col gap-2">
                    <p className="text-[9px] text-slate-400 font-bold tracking-wider">⚙ CÀI ĐẶT</p>
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
                        {saving ? '⏳ Đang lưu...' : '💾 Lưu & Áp dụng'}
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Main PipelineVisualizer ─────────────────────
// ── ErrorModalWrapper — reads error data from Redux ──────
function ErrorModalWrapper({ campaignId, node, onClose }: { campaignId: string; node: FlowNodeInfo; onClose: () => void }) {
    const activeInfo = useSelector((s: RootState) =>
        s.nodeEvents.activeNodes?.[campaignId]?.[node.instance_id]
    )
    const rawError = activeInfo?.error || 'Unknown error'
    const errCode = activeInfo?.errorCode || extractErrorCodeFromMessage(rawError)
    const resolution = getErrorResolution(errCode || undefined)
    const meta = nodeMeta(node)

    return (
        <NodeErrorModal
            open
            resolution={resolution}
            rawError={rawError}
            nodeName={meta.label}
            nodeIcon={meta.icon}
            campaignId={campaignId}
            instanceId={node.instance_id}
            onClose={onClose}
        />
    )
}

export function PipelineVisualizer({ campaignId, workflowId, vertical = false }: PipelineVisualizerProps) {
    const [flowData, setFlowData] = useState<{ nodes: FlowNodeInfo[]; edges: FlowEdge[] } | null>(null)
    const [selectedNode, setSelectedNode] = useState<FlowNodeInfo | null>(null)
    const [campaignParams, setCampaignParams] = useState<any>({})
    const [errorModalNode, setErrorModalNode] = useState<FlowNodeInfo | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const dispatch = useDispatch()

    // ── Drag-to-Pan ──────────────────────────────
    const isPanning = useRef(false)
    const panStart = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 })

    const onPanDown = useCallback((e: React.MouseEvent) => {
        // Only left-click on empty space (not on nodes/buttons)
        if (e.button !== 0) return
        const tag = (e.target as HTMLElement).tagName
        if (['BUTTON', 'INPUT', 'A', 'SELECT'].includes(tag)) return
        // Skip if clicked on a node card
        if ((e.target as HTMLElement).closest('[role="button"]')) return

        isPanning.current = true
        panStart.current = { x: e.clientX, y: e.clientY, scrollX: scrollRef.current?.scrollLeft || 0, scrollY: scrollRef.current?.scrollTop || 0 }
        if (scrollRef.current) scrollRef.current.style.cursor = 'grabbing'
        e.preventDefault()
    }, [])

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isPanning.current || !scrollRef.current) return
            const dx = e.clientX - panStart.current.x
            const dy = e.clientY - panStart.current.y
            scrollRef.current.scrollLeft = panStart.current.scrollX - dx
            scrollRef.current.scrollTop = panStart.current.scrollY - dy
        }
        const onUp = () => {
            isPanning.current = false
            if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    }, [])

    useEffect(() => {
        // @ts-ignore
        window.api.invoke('campaign:get-flow-nodes', { workflowId, campaignId })
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

    if (!flowData) return <div className="p-6 flex text-slate-400">Đang tải pipeline...</div>

    return (
        <div className="flex bg-slate-50 rounded-xl border border-slate-200 overflow-hidden relative" style={{ minHeight: vertical ? '200px' : '280px' }}>
            <div ref={scrollRef}
                className={`flex-1 p-6 relative ${vertical ? 'overflow-y-auto overflow-x-hidden' : 'overflow-x-auto overflow-y-hidden'}`}
                style={{ cursor: 'grab' }}
                onMouseDown={onPanDown}>
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
                                        onViewError={setErrorModalNode}
                                    />
                                ) : (
                                    <NodeCard
                                        key={node.instance_id}
                                        node={node} campaignId={campaignId}
                                        isSelected={selectedNode?.instance_id === node.instance_id} onSelect={setSelectedNode} campaignParams={campaignParams}
                                        onViewError={setErrorModalNode}
                                    />
                                )
                            })}
                        </div>)
                    })}
                </div>
            </div>

            {selectedNode && <InspectPanel node={selectedNode} campaignId={campaignId} onClose={() => setSelectedNode(null)} campaignParams={campaignParams} onParamsUpdate={(p) => setCampaignParams(p)} />}

            {/* NodeErrorModal — opens when user clicks error badge or tooltip Details */}
            {errorModalNode && <ErrorModalWrapper campaignId={campaignId} node={errorModalNode} onClose={() => setErrorModalNode(null)} />}
        </div>
    )
}

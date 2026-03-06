import { useCallback, useEffect, useMemo, useRef, type ReactElement, useState } from 'react'
import {
    ReactFlow,
    Background,
    type Node,
    type Edge,
    type NodeTypes,
    type EdgeTypes,
    type NodeProps,
    Handle,
    Position,
    BaseEdge,
    getSmoothStepPath,
    type EdgeProps,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import { getErrorResolution, extractErrorCodeFromMessage } from '@core/troubleshooting/errorResolution'

// ── Types ──────────────────────────────────────────────
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

type NodeStatus = 'idle' | 'running' | 'done' | 'error'

// ── Helpers ────────────────────────────────────────────
const FALLBACK_META = { icon: '📦', label: '', color: '#6b7280', desc: '' }

function nodeMeta(node: FlowNodeInfo) {
    return {
        icon: node.icon || FALLBACK_META.icon,
        label: node.label || node.node_id,
        color: node.color || FALLBACK_META.color,
        desc: node.description || '',
    }
}

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

// ── CSS animations (injected once) ─────────────────────
const STYLE_INJECT = `
@keyframes rf-tooltip-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.18); }
  50%     { box-shadow: 0 0 0 6px transparent; }
}
@keyframes rf-edge-dash {
  to { stroke-dashoffset: -24; }
}
@keyframes rf-edge-dot {
  0%   { offset-distance: 0%; }
  100% { offset-distance: 100%; }
}
.rf-tooltip-pulse { animation: rf-tooltip-pulse 2s ease-in-out infinite; }

/* Override React Flow's node wrapper to allow tooltip overflow */
.react-flow__node {
  overflow: visible !important;
  z-index: 1;
}
.react-flow__node:hover {
  z-index: 1000 !important;
}
.react-flow__viewport {
  overflow: visible !important;
}
`

// ── NodeTooltip (hover popup) ─────────────────────────
function NodeTooltip({ node, campaignId, onViewError }: {
    node: FlowNodeInfo; campaignId: string; onViewError?: () => void
}) {
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
        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[9999] w-max ${isError ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div className={`bg-white/95 backdrop-blur-xl border rounded-xl p-3 shadow-xl ${isError ? 'border-red-300 rf-tooltip-pulse' : 'border-slate-200'}`}
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
                {stat.total > 1 && (
                    <div className="flex gap-3 text-[10px] border-t border-slate-100 pt-1.5 mt-1.5">
                        {stat.completed > 0 && <span className="text-emerald-600">✓ {stat.completed}</span>}
                        {stat.running > 0 && <span className="text-blue-600">▶ {stat.running}</span>}
                        {stat.pending > 0 && <span className="text-amber-600">… {stat.pending}</span>}
                        {stat.failed > 0 && <span className="text-rose-500">✗ {stat.failed}</span>}
                    </div>
                )}
                {progressMsg && <p className="text-[10px] mt-1.5 truncate" style={{ color: meta.color }}>{progressMsg}</p>}

                {isError && resolution && (
                    <div className="mt-2 pt-2 border-t border-red-200 space-y-2">
                        <div className="flex items-center gap-1.5">
                            {errorCode && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">{errorCode}</span>}
                            <span className="text-[10px] font-bold text-red-600">{resolution.icon} {resolution.userTitle}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{resolution.cause}</p>
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
                {isError && !resolution && error && (
                    <p className="text-[10px] text-rose-500 mt-1 bg-rose-50 rounded px-1.5 py-0.5">⚠ {error}</p>
                )}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-white border-b border-r border-slate-200" />
            </div>
        </div>
    )
}

// ── Custom Workflow Node ───────────────────────────────
interface WorkflowNodeData {
    flowNode: FlowNodeInfo
    campaignId: string
    campaignParams?: any
    onSelectNode: (node: FlowNodeInfo) => void
    onRequestErrorNode: (node: FlowNodeInfo) => void
    compact?: boolean
    [key: string]: unknown
}

function WorkflowNodeComponent({ data }: NodeProps<Node<WorkflowNodeData>>) {
    const { flowNode: node, campaignId, campaignParams, onSelectNode, onRequestErrorNode, compact = false } = data
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
    const meta = nodeMeta(node)

    let borderColor = '#e2e8f0'
    let bgClass = 'bg-white'
    if (status === 'running') { borderColor = meta.color; bgClass = 'bg-white' }
    else if (status === 'error') { borderColor = '#fca5a5'; bgClass = 'bg-red-50' }
    else if (status === 'done') { borderColor = '#86efac'; bgClass = 'bg-emerald-50/50' }

    const isTimeout = node.node_id === 'core.timeout'
    const isBatchNode = ['tiktok.scanner', 'core.file_source', 'core.publish_scheduler', 'core.time_gate', 'core.campaign_finish'].includes(node.node_id)
    const waitMinutes = isTimeout ? (campaignParams?.publishIntervalMinutes || '?') : null
    const showRawStats = !isTimeout && !isBatchNode && stat.total > 0

    return (
        <div className="relative group z-10 w-max h-max nopan">
            {/* Connection handles — vertical layout: top=target, bottom=source */}
            <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-slate-300 !border-slate-400" />
            <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-300 !border-slate-400" />

            {/* Settings icon */}
            {node.editable_settings && (
                <span
                    onClick={(e) => { e.stopPropagation(); onSelectNode(node) }}
                    className="absolute -top-2 -right-2 text-slate-400 text-[10px] bg-white border border-slate-200 rounded-full w-5 h-5 flex items-center justify-center shadow-sm cursor-pointer hover:text-purple-500 hover:border-purple-300 transition z-40"
                    title="Settings"
                >⚙️</span>
            )}

            {/* Error badge */}
            {status === 'error' && (
                <div className="absolute -top-2 -right-2 z-30 animate-bounce">
                    <button onClick={(e) => { e.stopPropagation(); onRequestErrorNode(node) }}
                        className="w-6 h-6 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:bg-red-600 transition"
                        title="View error details">!</button>
                </div>
            )}

            {/* Running gradient border */}
            {status === 'running' && (
                <div className="absolute inset-[-3px] rounded-[14px] z-0 pointer-events-none"
                    style={{
                        background: `linear-gradient(135deg, ${meta.color}, ${meta.color}44, ${meta.color})`,
                    }} />
            )}

            {/* Main card */}
            <div
                onClick={() => onSelectNode(node)}
                className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${bgClass} shadow-sm hover:shadow-md hover:-translate-y-0.5 z-10`}
                style={{ borderColor, width: compact ? 110 : 140, padding: compact ? '6px 10px' : '10px 12px' }}
            >
                {status === 'running' && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] animate-pulse"
                        style={{ backgroundImage: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }} />
                )}
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={status === 'running' ? 'animate-bounce' : ''} style={{ fontSize: compact ? 13 : 16 }}>{meta.icon}</span>
                    <span className="font-semibold text-slate-700 truncate" style={{ fontSize: compact ? 9 : 11 }}>{meta.label}</span>
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

            {/* Hover tooltip */}
            <div className="hidden group-hover:block">
                <NodeTooltip node={node} campaignId={campaignId} onViewError={() => onRequestErrorNode(node)} />
            </div>
        </div>
    )
}

// ── Custom Loop Group Node ────────────────────────────
interface LoopGroupNodeData {
    flowNode: FlowNodeInfo
    campaignId: string
    loopWidth: number
    loopHeight: number
    [key: string]: unknown
}

function LoopGroupNodeComponent({ data }: NodeProps<Node<LoopGroupNodeData>>) {
    const { flowNode: node, campaignId, loopWidth, loopHeight } = data
    const { status, stat, progressMsg } = useNodeStatus(campaignId, node.instance_id)
    const isRunning = status === 'running'
    const isFailed = status === 'error'
    const isDone = status === 'done'

    let borderColor = '#bae6fd'
    if (isRunning) borderColor = '#38bdf8'
    else if (isFailed) borderColor = '#fca5a5'
    else if (isDone) borderColor = '#86efac'

    return (
        <div className="relative" style={{ width: loopWidth, height: loopHeight }}>
            {/* Handles on the group — vertical layout */}
            <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-300 !border-sky-400" />
            <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-300 !border-sky-400" />

            {/* Dashed border loop container */}
            <div className="absolute inset-0 rounded-[24px] border-[2px] border-dashed transition-all duration-700"
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
            </div>

            {/* Loop label badge */}
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
    )
}

// ── Custom Animated Edge ──────────────────────────────
interface AnimatedEdgeData {
    campaignId: string
    targetInstanceId: string
    edgeLabel?: string
    [key: string]: unknown
}

function AnimatedEdgeComponent({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style }: EdgeProps<Edge<AnimatedEdgeData>>) {
    const campaignId = data?.campaignId || ''
    const targetId = data?.targetInstanceId || ''
    const label = data?.edgeLabel

    const stat = useSelector((s: RootState) =>
        s.nodeEvents.byCampaign[campaignId]?.nodeStats?.[targetId] || { running: 0, completed: 0, failed: 0 }
    )
    const active = useSelector((s: RootState) =>
        s.nodeEvents.activeNodes?.[campaignId]?.[targetId]
    )

    const isError = active?.status === 'failed' || stat.failed > 0
    const isRunning = active?.status === 'running' || stat.running > 0
    const isDone = stat.completed > 0 && !isRunning && !isError

    let stroke = '#94a3b8'
    if (isError) stroke = '#ef4444'
    else if (isRunning) stroke = '#0ea5e9'
    else if (isDone) stroke = '#10b981'

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
        borderRadius: 12,
    })

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    ...style,
                    stroke,
                    strokeWidth: isRunning ? 2.5 : 2,
                    strokeDasharray: isRunning ? '7 5' : undefined,
                    animation: isRunning ? 'rf-edge-dash 0.6s linear infinite' : undefined,
                }}
            />
            {isRunning && (
                <circle r="3" fill="#38bdf8">
                    <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
                </circle>
            )}
            {label && (
                <foreignObject x={labelX - 40} y={labelY - 9} width={80} height={18} className="pointer-events-none overflow-visible">
                    <div className="flex justify-center">
                        <span className="text-[8px] font-bold text-orange-500 bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-sm">
                            {label}
                        </span>
                    </div>
                </foreignObject>
            )}
        </>
    )
}

// ── Layout engine ────────────────────────────────────
const NODE_W = 160
const NODE_H = 64
const CHILD_W = 130
const CHILD_H = 56
const GAP_H = 80
const GAP_V = 40
const LOOP_PAD_X = 30
const LOOP_PAD_Y = 30
const CHILD_GAP = 50

function buildReactFlowElements(
    flowData: { nodes: FlowNodeInfo[], edges: FlowEdge[] },
    layers: FlowNodeInfo[][],
    campaignId: string,
    campaignParams: any,
    onSelectNode: (node: FlowNodeInfo) => void,
    onRequestErrorNode: (node: FlowNodeInfo) => void,
    _vertical: boolean,
): { nodes: Node[]; edges: Edge[] } {
    const nodeById = new Map<string, FlowNodeInfo>()
    for (const n of flowData.nodes) nodeById.set(n.instance_id, n)

    const childSet = new Set<string>()
    flowData.nodes.forEach(n => n.children?.forEach(c => childSet.add(c)))

    const rfNodes: Node[] = []
    const rfEdges: Edge[] = []

    // Position layers vertically (top-to-bottom)
    let cursorY = 40

    for (const layer of layers) {
        let maxHeight = 0
        let cursorX = 40
        const layerNodes: { node: FlowNodeInfo, x: number, y: number, w: number, h: number }[] = []

        for (const node of layer) {
            const hasChildren = node.children && node.children.length > 0

            if (hasChildren) {
                const children = node.children!.map(cid => nodeById.get(cid)!).filter(Boolean)
                const childrenTotalW = children.length * CHILD_W + (children.length - 1) * CHILD_GAP
                const loopW = Math.max(320, childrenTotalW + LOOP_PAD_X * 2)
                const loopH = CHILD_H + LOOP_PAD_Y * 2 + 20

                // Loop group node
                rfNodes.push({
                    id: node.instance_id,
                    type: 'loopGroup',
                    position: { x: cursorX, y: cursorY },
                    data: {
                        flowNode: node,
                        campaignId,
                        loopWidth: loopW,
                        loopHeight: loopH,
                    },
                    style: { width: loopW, height: loopH },
                })

                // Children inside loop (horizontal inside the group)
                let childX = LOOP_PAD_X
                for (const child of children) {
                    rfNodes.push({
                        id: child.instance_id,
                        type: 'workflowNode',
                        position: { x: childX, y: LOOP_PAD_Y },
                        parentId: node.instance_id,
                        data: {
                            flowNode: child,
                            campaignId,
                            campaignParams,
                            onSelectNode,
                            onRequestErrorNode,
                            compact: true,
                        },
                    })
                    childX += CHILD_W + CHILD_GAP
                }

                // Edges between children inside the loop
                for (let i = 0; i < children.length - 1; i++) {
                    const from = children[i]
                    const to = children[i + 1]
                    rfEdges.push({
                        id: `child-${from.instance_id}-${to.instance_id}`,
                        source: from.instance_id,
                        target: to.instance_id,
                        type: 'animatedEdge',
                        data: { campaignId, targetInstanceId: to.instance_id },
                    })
                }

                layerNodes.push({ node, x: cursorX, y: cursorY, w: loopW, h: loopH })
                cursorX += loopW + GAP_H
            } else {
                // Regular node
                rfNodes.push({
                    id: node.instance_id,
                    type: 'workflowNode',
                    position: { x: cursorX, y: cursorY },
                    data: {
                        flowNode: node,
                        campaignId,
                        campaignParams,
                        onSelectNode,
                        onRequestErrorNode,
                    },
                })
                layerNodes.push({ node, x: cursorX, y: cursorY, w: NODE_W, h: NODE_H })
                cursorX += NODE_W + GAP_H
            }
        }

        // Track max height in this layer
        for (const ln of layerNodes) {
            if (ln.h > maxHeight) maxHeight = ln.h
        }
        cursorY += maxHeight + GAP_V
    }

    // Build edges from flow data (top-level edges only, child edges already done)
    const outgoingBySource = new Map<string, FlowEdge[]>()
    for (const edge of flowData.edges) {
        if (!outgoingBySource.has(edge.from)) outgoingBySource.set(edge.from, [])
        outgoingBySource.get(edge.from)!.push(edge)
    }

    for (const edge of flowData.edges) {
        // Skip child-to-child edges (already handled inside loop)
        if (childSet.has(edge.from) && childSet.has(edge.to)) continue

        const siblings = outgoingBySource.get(edge.from) || []
        const totalBranches = siblings.length
        const branchIndex = siblings.findIndex(e => e.to === edge.to && e.when === edge.when)

        const sourceNode = nodeById.get(edge.from)
        const isConditionSource = sourceNode?.node_id === 'core.condition'
        const label = edge.when?.trim()
            || (isConditionSource && totalBranches > 1 && branchIndex > 0 ? 'else' : isConditionSource ? 'if' : undefined)

        rfEdges.push({
            id: `edge-${edge.from}-${edge.to}-${edge.when || ''}`,
            source: edge.from,
            target: edge.to,
            type: 'animatedEdge',
            data: {
                campaignId,
                targetInstanceId: edge.to,
                edgeLabel: label,
            },
        })
    }

    return { nodes: rfNodes, edges: rfEdges }
}

// ── Node / Edge type registries ──────────────────────
const nodeTypes: NodeTypes = {
    workflowNode: WorkflowNodeComponent as any,
    loopGroup: LoopGroupNodeComponent as any,
}

const edgeTypes: EdgeTypes = {
    animatedEdge: AnimatedEdgeComponent as any,
}

// ── Main component ───────────────────────────────────
export interface PipelineVisualizerFlowProps {
    campaignId: string
    flowData: { nodes: FlowNodeInfo[]; edges: FlowEdge[] }
    layers: FlowNodeInfo[][]
    allChildren: FlowNodeInfo[]
    selectedNodeId: string | null
    vertical?: boolean
    campaignParams?: any
    onSelectNode: (node: FlowNodeInfo) => void
    onRequestErrorNode: (node: FlowNodeInfo) => void
}

function PipelineVisualizerFlowInner({
    campaignId, flowData, layers, vertical = false,
    campaignParams, onSelectNode, onRequestErrorNode,
}: PipelineVisualizerFlowProps): ReactElement {
    const { fitView } = useReactFlow()
    const prevCountRef = useRef({ nodes: 0, edges: 0 })

    // Build a lookup map so onNodeClick can resolve FlowNodeInfo from node id
    const nodeById = useMemo(() => {
        const map = new Map<string, FlowNodeInfo>()
        for (const n of flowData.nodes) map.set(n.instance_id, n)
        return map
    }, [flowData.nodes])

    const { nodes, edges } = useMemo(() =>
        buildReactFlowElements(flowData, layers, campaignId, campaignParams, onSelectNode, onRequestErrorNode, vertical),
        [flowData, layers, campaignId, campaignParams, onSelectNode, onRequestErrorNode, vertical]
    )

    // React Flow level click handler — ensures InspectPanel opens reliably
    const handleNodeClick = useCallback((_event: React.MouseEvent, rfNode: Node) => {
        const info = nodeById.get(rfNode.id)
        if (info) onSelectNode(info)
    }, [nodeById, onSelectNode])

    // Detect running node from Redux to auto-focus
    const activeNodes = useSelector((s: RootState) => s.nodeEvents.activeNodes?.[campaignId] || {})
    const runningNodeId = useMemo(() => {
        for (const [instanceId, info] of Object.entries(activeNodes)) {
            if ((info as any)?.status === 'running') return instanceId
        }
        return null
    }, [activeNodes])

    // Auto fit-view when the graph shape changes
    useEffect(() => {
        const current = { nodes: flowData.nodes.length, edges: flowData.edges.length }
        if (current.nodes !== prevCountRef.current.nodes || current.edges !== prevCountRef.current.edges) {
            prevCountRef.current = current
            setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 100)
        }
    }, [flowData.nodes.length, flowData.edges.length, fitView])

    // Initial fit
    const didFit = useRef(false)
    useEffect(() => {
        if (!didFit.current && nodes.length > 0) {
            didFit.current = true
            setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 200)
        }
    }, [nodes.length, fitView])

    // Auto-focus on running node when it changes
    const { setCenter } = useReactFlow()
    const prevRunningRef = useRef<string | null>(null)
    useEffect(() => {
        if (runningNodeId && runningNodeId !== prevRunningRef.current) {
            prevRunningRef.current = runningNodeId
            const rfNode = nodes.find(n => n.id === runningNodeId)
            if (rfNode) {
                const nodeW = rfNode.style?.width ? Number(rfNode.style.width) : NODE_W
                const nodeH = rfNode.style?.height ? Number(rfNode.style.height) : NODE_H
                setTimeout(() => {
                    setCenter(
                        rfNode.position.x + nodeW / 2,
                        rfNode.position.y + nodeH / 2,
                        { zoom: 1, duration: 500 }
                    )
                }, 150)
            }
        }
    }, [runningNodeId, nodes, setCenter])

    return (
        <>
            <style>{STYLE_INJECT}</style>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.3}
                maxZoom={2.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnScroll
                zoomOnScroll
                zoomOnPinch
                panOnDrag
                className="bg-slate-50"
            >
                <Background gap={20} size={1} color="#e2e8f050" />
            </ReactFlow>
        </>
    )
}

export function PipelineVisualizerFlow(props: PipelineVisualizerFlowProps): ReactElement {
    return (
        <ReactFlowProvider>
            <PipelineVisualizerFlowInner {...props} />
        </ReactFlowProvider>
    )
}

import { useEffect, useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../store/store'
import { updateNodeProgress } from '../../store/nodeEventsSlice'
import { getErrorResolution, extractErrorCodeFromMessage } from '@core/troubleshooting/errorResolution'
import { NodeErrorModal } from '../../components/detail/NodeErrorModal'
import { PipelineVisualizerFlow } from './PipelineVisualizerFlow'

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

// NodeTooltip, NodeCard, LoopBlock, SvgOverlay removed — now rendered inside React Flow (PipelineVisualizerFlow.tsx)

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
    const dispatch = useDispatch()

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
        <div className="flex bg-slate-50 rounded-xl border border-slate-200 overflow-hidden relative" style={{ minHeight: vertical ? '260px' : '360px' }}>
            <div className="flex-1 relative" style={{ minHeight: '240px' }}>
                <PipelineVisualizerFlow
                    campaignId={campaignId}
                    flowData={flowData}
                    layers={layers}
                    allChildren={allChildren}
                    selectedNodeId={selectedNode?.instance_id || null}
                    vertical={vertical}
                    campaignParams={campaignParams}
                    onSelectNode={setSelectedNode}
                    onRequestErrorNode={setErrorModalNode}
                />
            </div>

            {selectedNode && <InspectPanel node={selectedNode} campaignId={campaignId} onClose={() => setSelectedNode(null)} campaignParams={campaignParams} onParamsUpdate={(p) => setCampaignParams(p)} />}

            {/* NodeErrorModal — opens when user clicks error badge or tooltip Details */}
            {errorModalNode && <ErrorModalWrapper campaignId={campaignId} node={errorModalNode} onClose={() => setErrorModalNode(null)} />}
        </div>
    )
}

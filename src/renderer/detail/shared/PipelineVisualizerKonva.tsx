import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Arrow, Group, Label, Layer, Rect, Stage, Tag, Text } from 'react-konva'
import type Konva from 'konva'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'

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

interface PipelineVisualizerKonvaProps {
  campaignId: string
  flowData: { nodes: FlowNodeInfo[]; edges: FlowEdge[] }
  layers: FlowNodeInfo[][]
  allChildren: FlowNodeInfo[]
  selectedNodeId: string | null
  vertical?: boolean
  onSelectNode: (node: FlowNodeInfo) => void
  onRequestErrorNode: (node: FlowNodeInfo) => void
}

type NodeStatus = 'idle' | 'running' | 'done' | 'error'

interface NodeStat {
  pending: number
  running: number
  completed: number
  failed: number
  total: number
}

interface NodeRenderBox {
  node: FlowNodeInfo
  x: number
  y: number
  w: number
  h: number
  isLoopParent: boolean
  isChild: boolean
}

interface EdgeRender {
  edge: FlowEdge
  points: number[]
  label?: string
  labelX: number
  labelY: number
  status: NodeStatus
}

const FALLBACK_META = { icon: '📦', label: '', color: '#64748b' }
const PADDING = 28
const NODE_W = 168
const NODE_H = 80
const CHILD_W = 126
const CHILD_H = 64
const NODE_GAP = 22
const LAYER_GAP = 88
const CHILD_GAP = 22
const LOOP_H = 122
const LOOP_MIN_W = 320

function meta(node: FlowNodeInfo): { icon: string; label: string; color: string } {
  return {
    icon: node.icon || FALLBACK_META.icon,
    label: node.label || node.node_id,
    color: node.color || FALLBACK_META.color,
  }
}

function statusFromNode(stat: NodeStat, activeInfo: { status?: string } | undefined): NodeStatus {
  const isError = activeInfo?.status === 'failed' || stat.failed > 0
  const isRunning = activeInfo?.status === 'running' || stat.running > 0
  const isDone = stat.completed > 0 && !isRunning && !isError
  if (isError) return 'error'
  if (isRunning) return 'running'
  if (isDone) return 'done'
  return 'idle'
}

function nodeStyle(status: NodeStatus, isSelected: boolean, accent: string): { fill: string; stroke: string; text: string } {
  if (isSelected) return { fill: '#f5f3ff', stroke: '#8b5cf6', text: '#1e1b4b' }
  if (status === 'running') return { fill: '#f0f9ff', stroke: accent, text: '#0f172a' }
  if (status === 'error') return { fill: '#fef2f2', stroke: '#ef4444', text: '#7f1d1d' }
  if (status === 'done') return { fill: '#ecfdf5', stroke: '#22c55e', text: '#14532d' }
  return { fill: '#ffffff', stroke: '#cbd5e1', text: '#0f172a' }
}

function estimateLoopWidth(childrenCount: number): number {
  if (childrenCount <= 0) return LOOP_MIN_W
  const childTrack = childrenCount * CHILD_W + (childrenCount - 1) * CHILD_GAP + 40
  return Math.max(LOOP_MIN_W, childTrack)
}

function buildLayout(
  layers: FlowNodeInfo[][],
  vertical: boolean,
  nodeById: Map<string, FlowNodeInfo>,
): {
  boxes: Map<string, NodeRenderBox>
  sceneWidth: number
  sceneHeight: number
} {
  const boxes = new Map<string, NodeRenderBox>()
  let sceneW = 0
  let sceneH = 0

  if (vertical) {
    let y = PADDING
    for (const layer of layers) {
      const entries = layer.map((node) => {
        const isLoopParent = Boolean(node.children?.length)
        return {
          node,
          isLoopParent,
          w: isLoopParent ? estimateLoopWidth(node.children?.length || 0) : NODE_W,
          h: isLoopParent ? LOOP_H : NODE_H,
        }
      })
      const layerW = entries.reduce((sum, e, idx) => sum + e.w + (idx > 0 ? NODE_GAP : 0), 0)
      let x = PADDING
      for (const entry of entries) {
        boxes.set(entry.node.instance_id, {
          node: entry.node,
          x,
          y,
          w: entry.w,
          h: entry.h,
          isLoopParent: entry.isLoopParent,
          isChild: false,
        })

        if (entry.isLoopParent) {
          const children = (entry.node.children || [])
            .map((id) => nodeById.get(id))
            .filter(Boolean) as FlowNodeInfo[]
          const childTrackW = children.length > 0 ? (children.length * CHILD_W + (children.length - 1) * CHILD_GAP) : 0
          let cx = x + Math.max(20, (entry.w - childTrackW) / 2)
          const cy = y + (entry.h / 2) - (CHILD_H / 2)
          for (const child of children) {
            boxes.set(child.instance_id, {
              node: child,
              x: cx,
              y: cy,
              w: CHILD_W,
              h: CHILD_H,
              isLoopParent: false,
              isChild: true,
            })
            cx += CHILD_W + CHILD_GAP
          }
        }

        x += entry.w + NODE_GAP
      }
      sceneW = Math.max(sceneW, PADDING + layerW + PADDING)
      const layerH = Math.max(...entries.map((e) => e.h), NODE_H)
      y += layerH + LAYER_GAP
    }
    sceneH = y + PADDING
  } else {
    let x = PADDING
    for (const layer of layers) {
      const entries = layer.map((node) => {
        const isLoopParent = Boolean(node.children?.length)
        return {
          node,
          isLoopParent,
          w: isLoopParent ? estimateLoopWidth(node.children?.length || 0) : NODE_W,
          h: isLoopParent ? LOOP_H : NODE_H,
        }
      })
      const columnW = Math.max(...entries.map((e) => e.w), NODE_W)
      let y = PADDING

      for (const entry of entries) {
        boxes.set(entry.node.instance_id, {
          node: entry.node,
          x,
          y,
          w: entry.w,
          h: entry.h,
          isLoopParent: entry.isLoopParent,
          isChild: false,
        })

        if (entry.isLoopParent) {
          const children = (entry.node.children || [])
            .map((id) => nodeById.get(id))
            .filter(Boolean) as FlowNodeInfo[]
          const childTrackW = children.length > 0 ? (children.length * CHILD_W + (children.length - 1) * CHILD_GAP) : 0
          let cx = x + Math.max(20, (entry.w - childTrackW) / 2)
          const cy = y + (entry.h / 2) - (CHILD_H / 2)
          for (const child of children) {
            boxes.set(child.instance_id, {
              node: child,
              x: cx,
              y: cy,
              w: CHILD_W,
              h: CHILD_H,
              isLoopParent: false,
              isChild: true,
            })
            cx += CHILD_W + CHILD_GAP
          }
        }

        y += entry.h + NODE_GAP
      }

      sceneH = Math.max(sceneH, y + PADDING)
      x += columnW + LAYER_GAP
    }
    sceneW = x + PADDING
  }

  return { boxes, sceneWidth: Math.max(sceneW, 640), sceneHeight: Math.max(sceneH, 360) }
}

function buildAnchors(
  boxes: Map<string, NodeRenderBox>,
  vertical: boolean,
): Map<string, { inX: number; inY: number; outX: number; outY: number }> {
  const anchors = new Map<string, { inX: number; inY: number; outX: number; outY: number }>()
  for (const [id, b] of boxes.entries()) {
    const forceHorizontal = b.isChild
    if (vertical && !forceHorizontal) {
      anchors.set(id, {
        inX: b.x + b.w / 2,
        inY: b.y,
        outX: b.x + b.w / 2,
        outY: b.y + b.h,
      })
    } else {
      anchors.set(id, {
        inX: b.x,
        inY: b.y + b.h / 2,
        outX: b.x + b.w,
        outY: b.y + b.h / 2,
      })
    }
  }
  return anchors
}

function routeOrthogonal(
  start: { x: number; y: number },
  end: { x: number; y: number },
  orientation: 'horizontal' | 'vertical',
  backwardSlot: number,
  branchOffset: number,
): number[] {
  if (orientation === 'vertical') {
    const backward = end.y <= start.y + 8
    if (backward) {
      const laneX = Math.max(start.x, end.x) + 84 + backwardSlot * 28
      return [
        start.x, start.y,
        start.x, start.y + 18,
        laneX, start.y + 18,
        laneX, end.y - 18,
        end.x, end.y - 18,
        end.x, end.y,
      ]
    }
    const laneX = start.x + branchOffset
    return [
      start.x, start.y,
      start.x, start.y + 18,
      laneX, start.y + 18,
      laneX, end.y - 18,
      end.x, end.y - 18,
      end.x, end.y,
    ]
  }

  const backward = end.x <= start.x + 8
  if (backward) {
    const laneY = Math.max(start.y, end.y) + 74 + backwardSlot * 24
    return [
      start.x, start.y,
      start.x + 18, start.y,
      start.x + 18, laneY,
      end.x - 18, laneY,
      end.x - 18, end.y,
      end.x, end.y,
    ]
  }
  const laneY = ((start.y + end.y) / 2) + branchOffset
  return [
    start.x, start.y,
    start.x + 18, start.y,
    start.x + 18, laneY,
    end.x - 18, laneY,
    end.x - 18, end.y,
    end.x, end.y,
  ]
}

function edgeLabelPosition(points: number[]): { x: number; y: number } {
  if (points.length < 4) return { x: 0, y: 0 }
  const midIndex = Math.max(0, Math.floor((points.length / 2)) - 2)
  return { x: points[midIndex], y: points[midIndex + 1] - 10 }
}

function fitView(
  sceneWidth: number,
  sceneHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; scale: number } {
  const pad = 24
  const scale = Math.max(0.35, Math.min(1.3, Math.min(
    (viewportWidth - pad * 2) / Math.max(1, sceneWidth),
    (viewportHeight - pad * 2) / Math.max(1, sceneHeight),
  )))
  const x = (viewportWidth - sceneWidth * scale) / 2
  const y = (viewportHeight - sceneHeight * scale) / 2
  return { x, y, scale }
}

export function PipelineVisualizerKonva({
  campaignId,
  flowData,
  layers,
  allChildren: _allChildren,
  selectedNodeId,
  vertical = false,
  onSelectNode,
  onRequestErrorNode,
}: PipelineVisualizerKonvaProps): ReactElement {
  const statsByNode = useSelector((s: RootState) => s.nodeEvents.byCampaign[campaignId]?.nodeStats || {})
  const activeByNode = useSelector((s: RootState) => s.nodeEvents.activeNodes?.[campaignId] || {})

  const wrapperRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 900, h: 520 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const userMovedRef = useRef(false)

  const nodeById = useMemo(() => {
    const map = new Map<string, FlowNodeInfo>()
    for (const node of flowData.nodes) map.set(node.instance_id, node)
    return map
  }, [flowData.nodes])

  const { boxes, sceneWidth, sceneHeight } = useMemo(
    () => buildLayout(layers, vertical, nodeById),
    [layers, vertical, nodeById],
  )

  const anchors = useMemo(() => buildAnchors(boxes, vertical), [boxes, vertical])

  const edges = useMemo(() => {
    const outgoingBySource = new Map<string, FlowEdge[]>()
    const usedBackSlots = new Map<string, number>()
    for (const edge of flowData.edges) {
      if (!outgoingBySource.has(edge.from)) outgoingBySource.set(edge.from, [])
      outgoingBySource.get(edge.from)!.push(edge)
    }

    const rendered: EdgeRender[] = []
    for (const edge of flowData.edges) {
      const a = anchors.get(edge.from)
      const b = anchors.get(edge.to)
      if (!a || !b) continue

      const fromBox = boxes.get(edge.from)
      const toBox = boxes.get(edge.to)
      const orientation: 'horizontal' | 'vertical' =
        fromBox?.isChild || toBox?.isChild ? 'horizontal' : (vertical ? 'vertical' : 'horizontal')

      const siblings = outgoingBySource.get(edge.from) || []
      const branchIndex = siblings.findIndex((e) => e.to === edge.to && e.when === edge.when)
      const totalBranches = siblings.length
      const branchOffset = totalBranches > 1 ? (branchIndex - (totalBranches - 1) / 2) * 20 : 0

      const backwardKey = `${edge.from}:${orientation}`
      const backwardSlot = usedBackSlots.get(backwardKey) || 0
      const start = orientation === 'vertical' ? { x: a.outX, y: a.outY } : { x: a.outX, y: a.outY }
      const end = orientation === 'vertical' ? { x: b.inX, y: b.inY } : { x: b.inX, y: b.inY }
      const looksBackward = orientation === 'vertical' ? (end.y <= start.y + 8) : (end.x <= start.x + 8)
      if (looksBackward) usedBackSlots.set(backwardKey, backwardSlot + 1)

      const points = routeOrthogonal(start, end, orientation, backwardSlot, branchOffset)
      const labelPos = edgeLabelPosition(points)

      const targetStat = (statsByNode[edge.to] || { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }) as NodeStat
      const targetActive = activeByNode[edge.to] as { status?: string } | undefined
      const status = statusFromNode(targetStat, targetActive)

      const sourceNode = nodeById.get(edge.from)
      const isConditionSource = sourceNode?.node_id === 'core.condition'
      const label = edge.when?.trim()
        || (isConditionSource && totalBranches > 1 && branchIndex > 0 ? 'else' : isConditionSource ? 'if' : undefined)

      rendered.push({
        edge,
        points,
        label,
        labelX: labelPos.x,
        labelY: labelPos.y,
        status,
      })
    }
    return rendered
  }, [flowData.edges, anchors, boxes, vertical, statsByNode, activeByNode, nodeById])

  useLayoutEffect(() => {
    if (!wrapperRef.current) return
    const update = () => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      setViewport({
        w: Math.max(320, Math.floor(rect.width)),
        h: Math.max(240, Math.floor(rect.height)),
      })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    userMovedRef.current = false
  }, [flowData.nodes.length, flowData.edges.length, vertical])

  useEffect(() => {
    if (userMovedRef.current) return
    const next = fitView(sceneWidth, sceneHeight, viewport.w, viewport.h)
    setView(next)
  }, [sceneWidth, sceneHeight, viewport.w, viewport.h])

  const strokeForStatus = useCallback((status: NodeStatus): string => {
    if (status === 'error') return '#ef4444'
    if (status === 'running') return '#0ea5e9'
    if (status === 'done') return '#10b981'
    return '#94a3b8'
  }, [])

  const onWheel = useCallback((evt: Konva.KonvaEventObject<WheelEvent>) => {
    evt.evt.preventDefault()
    const stage = evt.target.getStage()
    if (!stage) return
    const oldScale = view.scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const direction = evt.evt.deltaY > 0 ? -1 : 1
    const scaleBy = 1.08
    const nextScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy
    const clamped = Math.max(0.35, Math.min(2.8, nextScale))

    const worldX = (pointer.x - view.x) / oldScale
    const worldY = (pointer.y - view.y) / oldScale

    setView({
      scale: clamped,
      x: pointer.x - worldX * clamped,
      y: pointer.y - worldY * clamped,
    })
    userMovedRef.current = true
  }, [view])

  return (
    <div ref={wrapperRef} className="relative w-full h-full min-h-[240px] bg-slate-50">
      <Stage width={viewport.w} height={viewport.h} onWheel={onWheel}>
        <Layer>
          <Group
            x={view.x}
            y={view.y}
            scaleX={view.scale}
            scaleY={view.scale}
            draggable
            onDragStart={() => { userMovedRef.current = true }}
            onDragEnd={(evt) => {
              userMovedRef.current = true
              setView((prev) => ({ ...prev, x: evt.target.x(), y: evt.target.y() }))
            }}
          >
            <Rect
              x={0}
              y={0}
              width={sceneWidth}
              height={sceneHeight}
              fill="#f8fafc"
              stroke="#e2e8f0"
              cornerRadius={16}
              listening={false}
            />

            {edges.map((edge, idx) => {
              const stroke = strokeForStatus(edge.status)
              return (
                <Group key={`${edge.edge.from}-${edge.edge.to}-${idx}`}>
                  <Arrow
                    points={edge.points}
                    stroke={stroke}
                    fill={stroke}
                    strokeWidth={edge.status === 'running' ? 2.5 : 2}
                    pointerLength={7}
                    pointerWidth={7}
                    tension={0}
                    dash={edge.status === 'running' ? [7, 5] : undefined}
                    lineJoin="round"
                    lineCap="round"
                    listening={false}
                  />
                  {edge.label && (
                    <Label x={edge.labelX} y={edge.labelY} listening={false}>
                      <Tag fill="#ffffff" stroke="#e2e8f0" cornerRadius={7} />
                      <Text text={edge.label} fontSize={9} fontStyle="700" padding={4} fill="#f97316" />
                    </Label>
                  )}
                </Group>
              )
            })}

            {[...boxes.values()].map((box) => {
              const m = meta(box.node)
              const stat = (statsByNode[box.node.instance_id] || { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }) as NodeStat
              const active = activeByNode[box.node.instance_id] as { status?: string } | undefined
              const status = statusFromNode(stat, active)
              const style = nodeStyle(status, selectedNodeId === box.node.instance_id, m.color)

              if (box.isLoopParent) {
                return (
                  <Group
                    key={box.node.instance_id}
                    x={box.x}
                    y={box.y}
                    onClick={() => onSelectNode(box.node)}
                    onTap={() => onSelectNode(box.node)}
                  >
                    <Rect
                      width={box.w}
                      height={box.h}
                      cornerRadius={22}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={2}
                      dash={[8, 6]}
                    />
                    <Text
                      x={12}
                      y={10}
                      text={`🔁 ${m.label}`}
                      fontSize={12}
                      fontStyle="700"
                      fill={style.text}
                      width={box.w - 24}
                      listening={false}
                    />
                  </Group>
                )
              }

              return (
                <Group
                  key={box.node.instance_id}
                  x={box.x}
                  y={box.y}
                  onClick={() => onSelectNode(box.node)}
                  onTap={() => onSelectNode(box.node)}
                  onDblClick={() => {
                    if (status === 'error') onRequestErrorNode(box.node)
                  }}
                  onDblTap={() => {
                    if (status === 'error') onRequestErrorNode(box.node)
                  }}
                >
                  <Rect
                    width={box.w}
                    height={box.h}
                    cornerRadius={12}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={box.isChild ? 1.5 : 2}
                    shadowColor="#0f172a"
                    shadowBlur={box.isChild ? 4 : 8}
                    shadowOpacity={0.08}
                    shadowOffsetY={2}
                  />
                  <Text
                    x={10}
                    y={8}
                    text={`${m.icon} ${m.label}`}
                    fontSize={box.isChild ? 10 : 11}
                    fontStyle="700"
                    fill={style.text}
                    width={box.w - 18}
                    ellipsis
                    listening={false}
                  />
                  {stat.total > 0 && (
                    <Text
                      x={10}
                      y={box.h - 20}
                      text={`✓${stat.completed}  ▶${stat.running}  ✗${stat.failed}`}
                      fontSize={9}
                      fill={status === 'error' ? '#dc2626' : '#475569'}
                      listening={false}
                    />
                  )}
                  {status !== 'idle' && (
                    <Rect
                      x={box.w - 12}
                      y={8}
                      width={4}
                      height={4}
                      cornerRadius={2}
                      fill={status === 'running' ? m.color : status === 'error' ? '#ef4444' : '#22c55e'}
                      listening={false}
                    />
                  )}
                </Group>
              )
            })}
          </Group>
        </Layer>
      </Stage>

      <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] font-medium bg-white/80 border border-slate-200 text-slate-500 pointer-events-none">
        Drag to pan · Wheel to zoom
      </div>
    </div>
  )
}

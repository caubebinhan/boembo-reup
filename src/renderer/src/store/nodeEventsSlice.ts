import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface JobSummary {
  id: string
  campaign_id: string
  workflow_id: string
  node_id: string
  instance_id: string
  type: string
  status: string
  data_json: string
  error_message?: string
  scheduled_at?: number
  started_at?: number
  completed_at?: number
}

export interface NodeStat {
  instance_id: string
  pending: number
  running: number
  completed: number
  failed: number
  total: number
  lastStatus?: string
  lastError?: string
}

export interface ActiveNodeInfo {
  status: 'running' | 'completed' | 'failed'
  message?: string
  jobId?: string
  error?: string
  updatedAt: number
}

export interface NodeEventsState {
  byCampaign: Record<string, {
    jobs: JobSummary[]
    nodeStats: Record<string, NodeStat>
    loading: boolean
  }>
  // Real-time node status from FlowEngine IPC events
  activeNodes: Record<string, Record<string, ActiveNodeInfo>>  // campaignId → instanceId → info
  // Progress messages per node
  nodeProgress: Record<string, Record<string, string>>  // campaignId → instanceId → last message
}

const initialState: NodeEventsState = {
  byCampaign: {},
  activeNodes: {},
  nodeProgress: {}
}

function computeNodeStats(jobs: JobSummary[]): Record<string, NodeStat> {
  const stats: Record<string, NodeStat> = {}
  for (const job of jobs) {
    if (!stats[job.instance_id]) {
      stats[job.instance_id] = {
        instance_id: job.instance_id,
        pending: 0, running: 0, completed: 0, failed: 0, total: 0
      }
    }
    const s = stats[job.instance_id]
    s.total++
    if (job.status === 'pending') s.pending++
    else if (job.status === 'running') s.running++
    else if (job.status === 'completed') s.completed++
    else if (job.status === 'failed') {
      s.failed++
      s.lastError = job.error_message
    }
    s.lastStatus = job.status
  }
  return stats
}

export const nodeEventsSlice = createSlice({
  name: 'nodeEvents',
  initialState,
  reducers: {
    setJobsForCampaign(state, action: PayloadAction<{ campaignId: string, jobs: JobSummary[] }>) {
      const { campaignId, jobs } = action.payload
      state.byCampaign[campaignId] = {
        jobs,
        nodeStats: computeNodeStats(jobs),
        loading: false
      }
    },
    setLoading(state, action: PayloadAction<{ campaignId: string }>) {
      const { campaignId } = action.payload
      if (!state.byCampaign[campaignId]) {
        state.byCampaign[campaignId] = { jobs: [], nodeStats: {}, loading: true }
      } else {
        state.byCampaign[campaignId].loading = true
      }
    },

    // ── Real-time node status from FlowEngine IPC ──
    updateNodeStatus(state, action: PayloadAction<{
      campaignId: string
      instanceId: string
      status: 'running' | 'completed' | 'failed'
      jobId?: string
      error?: string
    }>) {
      const { campaignId, instanceId, status, jobId, error } = action.payload
      if (!state.activeNodes[campaignId]) {
        state.activeNodes[campaignId] = {}
      }
      state.activeNodes[campaignId][instanceId] = {
        status,
        jobId,
        error,
        updatedAt: Date.now()
      }
    },

    updateNodeProgress(state, action: PayloadAction<{
      campaignId: string
      instanceId: string
      message: string
    }>) {
      const { campaignId, instanceId, message } = action.payload
      if (!state.nodeProgress[campaignId]) {
        state.nodeProgress[campaignId] = {}
      }
      state.nodeProgress[campaignId][instanceId] = message
    },

    clearCampaignNodes(state, action: PayloadAction<string>) {
      delete state.activeNodes[action.payload]
      delete state.nodeProgress[action.payload]
    }
  }
})

export const {
  setJobsForCampaign,
  setLoading,
  updateNodeStatus,
  updateNodeProgress,
  clearCampaignNodes
} = nodeEventsSlice.actions
export default nodeEventsSlice.reducer

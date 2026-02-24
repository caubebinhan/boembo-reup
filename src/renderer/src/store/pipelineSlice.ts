import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface VideoTask {
  id: string
  campaignId: string
  title: string
  thumbnail: string
  status: 'pending' | 'downloading' | 'processing' | 'scheduled' | 'posted' | 'failed'
  scheduledAt?: number
  postedAt?: number
  error?: string
}

export interface PipelineState {
  tasks: Record<string, VideoTask>
  runningCampaigns: string[]
}

const initialState: PipelineState = {
  tasks: {},
  runningCampaigns: []
}

export const pipelineSlice = createSlice({
  name: 'pipeline',
  initialState,
  reducers: {
    upsertTask(state, action: PayloadAction<Partial<VideoTask> & { id: string, campaignId: string }>) {
      const id = action.payload.id || action.payload.campaignId
      if (state.tasks[id]) {
        state.tasks[id] = { ...state.tasks[id], ...action.payload }
      } else {
        state.tasks[id] = action.payload as VideoTask
      }
    },
    setRunningCampaigns(state, action: PayloadAction<string[]>) {
      state.runningCampaigns = action.payload
    }
  }
})

export const { upsertTask, setRunningCampaigns } = pipelineSlice.actions
export default pipelineSlice.reducer

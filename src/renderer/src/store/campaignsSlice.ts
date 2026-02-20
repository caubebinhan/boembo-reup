import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Campaign } from '../../../core/types/Context'

interface CampaignsState {
  items: Campaign[]
  selected: string | null
  status: 'idle' | 'loading'
}

const initialState: CampaignsState = {
  items: [],
  selected: null,
  status: 'idle'
}

export const campaignsSlice = createSlice({
  name: 'campaigns',
  initialState,
  reducers: {
    setCampaigns(state, action: PayloadAction<Campaign[]>) {
      state.items = action.payload
    },
    selectCampaign(state, action: PayloadAction<string>) {
      state.selected = action.payload
    },
    addCampaign(state, action: PayloadAction<Campaign>) {
      state.items.push(action.payload)
    },
    updateCampaignStatus(state, action: PayloadAction<{id: string, status: Campaign['status']}>) {
      const camp = state.items.find(c => c.id === action.payload.id)
      if (camp) camp.status = action.payload.status
    }
  }
})

export const { setCampaigns, selectCampaign, addCampaign, updateCampaignStatus } = campaignsSlice.actions
export default campaignsSlice.reducer

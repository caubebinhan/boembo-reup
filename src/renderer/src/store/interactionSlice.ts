import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface InteractionState {
  type: string
  message: string
}

interface InteractionStoreState {
  waiting: Record<string, InteractionState>
}

const initialState: InteractionStoreState = {
  waiting: {}
}

export const interactionSlice = createSlice({
  name: 'interaction',
  initialState,
  reducers: {
    setInteractionWaiting(state, action: PayloadAction<{ campaignId: string, type: string, message: string }>) {
      state.waiting[action.payload.campaignId] = {
        type: action.payload.type,
        message: action.payload.message
      }
    },
    clearInteraction(state, action: PayloadAction<{ campaignId: string }>) {
      delete state.waiting[action.payload.campaignId]
    }
  }
})

export const { setInteractionWaiting, clearInteraction } = interactionSlice.actions
export default interactionSlice.reducer

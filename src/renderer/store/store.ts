import { configureStore } from '@reduxjs/toolkit'
import * as Sentry from '@sentry/react'
import campaignsReducer from './campaignsSlice'
import pipelineReducer from './pipelineSlice'
import interactionReducer from './interactionSlice'
import nodeEventsReducer from './nodeEventsSlice'

const sentryReduxEnhancer = Sentry.createReduxEnhancer({
  // Optionally pass options
})

export const store = configureStore({
  reducer: {
    campaigns: campaignsReducer,
    pipeline: pipelineReducer,
    interaction: interactionReducer,
    nodeEvents: nodeEventsReducer,
  },
  enhancers: (getDefaultEnhancers) => {
    return getDefaultEnhancers().concat(sentryReduxEnhancer as any)
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

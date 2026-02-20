import { useEffect, useState } from 'react'
import { Provider, useDispatch } from 'react-redux'
import { store } from './store/store'
import { upsertTask } from './store/pipelineSlice'
import { setInteractionWaiting, clearInteraction } from './store/interactionSlice'

import { TikTokChannelPicker } from './wizard/TikTokChannelPicker'
import { TikTokVideoPicker } from './wizard/TikTokVideoPicker'
import { ScheduleSetting } from './wizard/ScheduleSetting'
import { AccountPicker } from './wizard/AccountPicker'
import { CampaignList } from './components/CampaignList'
import { CampaignDetail } from './components/CampaignDetail'

import { CampaignWizard } from './components/CampaignWizard'

function AppContent() {
  const [route, setRoute] = useState(window.location.hash.split('?')[0].replace('#', ''))
  const [showWizard, setShowWizard] = useState(false)
  const dispatch = useDispatch()

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.split('?')[0].replace('#', ''))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    // Load initial campaigns
    // @ts-ignore
    window.api.invoke('campaign:list').then((campaigns) => {
      import('./store/campaignsSlice').then(({ setCampaigns }) => {
        dispatch(setCampaigns(campaigns))
      })
    })

    // Setup IPC listeners
    // @ts-ignore
    const offUpdate = window.api.on('pipeline:update', (payload) => {
      dispatch(upsertTask({
        id: payload.videoId,
        campaignId: payload.campaignId,
        status: payload.status,
        scheduledAt: payload.scheduledAt
      }))
    })

    // @ts-ignore
    const offWaiting = window.api.on('pipeline:interaction_waiting', (payload) => {
      dispatch(setInteractionWaiting(payload))
    })

    // @ts-ignore
    const offResolved = window.api.on('pipeline:interaction_resolved', (payload) => {
      dispatch(clearInteraction(payload))
    })

    // @ts-ignore
    const offCampaignCreated = window.api.on('campaign:created', (payload) => {
      import('./store/campaignsSlice').then(({ addCampaign }) => {
        dispatch(addCampaign(payload))
      })
    })

    return () => {
      offUpdate()
      offWaiting()
      offResolved()
      offCampaignCreated()
    }
  }, [dispatch])

  // Simple router for Wizard windows (These might be phased out with new Modal approach)
  if (route.startsWith('/wizard/tiktok-channel-picker')) return <TikTokChannelPicker />
  if (route.startsWith('/wizard/tiktok-video-picker')) return <TikTokVideoPicker />
  if (route.startsWith('/wizard/schedule-setting')) return <ScheduleSetting />
  if (route.startsWith('/wizard/account-picker')) return <AccountPicker />

  // Main UI
  return (
    <div className="flex w-full h-screen bg-gray-900 overflow-hidden">
      <CampaignList onOpenWizard={() => setShowWizard(true)} />
      <CampaignDetail />
      {showWizard && <CampaignWizard onClose={() => setShowWizard(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  )
}

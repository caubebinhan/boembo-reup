import { useEffect, useState } from 'react'
import { Provider, useDispatch } from 'react-redux'
import { store } from './store/store'
import { upsertTask } from './store/pipelineSlice'
import { setInteractionWaiting, clearInteraction } from './store/interactionSlice'
import { updateNodeStatus, updateNodeProgress } from './store/nodeEventsSlice'

import { TikTokChannelPicker } from './wizard/TikTokChannelPicker'
import { TikTokVideoPicker } from './wizard/TikTokVideoPicker'
import { ScheduleSetting } from './wizard/ScheduleSetting'
import { AccountPicker } from './wizard/AccountPicker'
import { CampaignList } from './components/CampaignList'
import { CampaignDetail } from './components/CampaignDetail'

import { CampaignWizard } from './components/CampaignWizard'

// ── Workflow Picker Modal ──────────────────────────
function WorkflowPicker({ onSelect, onClose }: { onSelect: (id: string) => void, onClose: () => void }) {
  const [flows, setFlows] = useState<any[]>([])

  useEffect(() => {
    // @ts-ignore
    window.api.invoke('flow:get-presets').then(setFlows).catch(console.error)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e293b] w-[500px] rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">Choose Workflow</h2>
          <p className="text-xs text-gray-500 mt-1">Select a workflow template for your campaign</p>
        </div>

        <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
          {flows.length === 0 && (
            <div className="text-gray-500 text-center py-8">No workflows available</div>
          )}
          {flows.map(flow => (
            <button
              key={flow.id}
              onClick={() => onSelect(flow.id)}
              className="w-full text-left p-4 rounded-xl border border-gray-700 hover:border-purple-500 hover:bg-purple-900/10 transition group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{flow.icon || '📋'}</span>
                <div className="flex-1">
                  <div className="font-semibold text-white group-hover:text-purple-300 transition">
                    {flow.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {flow.description || flow.id}
                  </div>
                </div>
                <span className="text-gray-600 group-hover:text-purple-400 transition">→</span>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────
function AppContent() {
  const [route, setRoute] = useState(window.location.hash.split('?')[0].replace('#', ''))
  const [showWizard, setShowWizard] = useState(false)
  const [showFlowPicker, setShowFlowPicker] = useState(false)
  const [selectedFlowId, setSelectedFlowId] = useState<string>('tiktok-repost')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const dispatch = useDispatch()

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.split('?')[0].replace('#', ''))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    // @ts-ignore
    window.api.invoke('campaign:list').then((campaigns: any) => {
      import('./store/campaignsSlice').then(({ setCampaigns }) => {
        dispatch(setCampaigns(campaigns))
      })
    })

    // @ts-ignore
    const offUpdate = window.api.on('pipeline:update', (payload: any) => {
      dispatch(upsertTask({
        id: payload.videoId,
        campaignId: payload.campaignId,
        status: payload.status,
        scheduledAt: payload.scheduledAt
      }))
    })

    // @ts-ignore
    const offWaiting = window.api.on('pipeline:interaction_waiting', (payload: any) => {
      dispatch(setInteractionWaiting(payload))
    })

    // @ts-ignore
    const offResolved = window.api.on('pipeline:interaction_resolved', (payload: any) => {
      dispatch(clearInteraction(payload))
    })

    // @ts-ignore
    const offCampaignCreated = window.api.on('campaign:created', (payload: any) => {
      import('./store/campaignsSlice').then(({ addCampaign }) => {
        dispatch(addCampaign(payload))
      })
    })

    // FlowEngine real-time events
    // @ts-ignore
    const offNodeStatus = window.api.on('node:status', (payload: any) => {
      dispatch(updateNodeStatus({
        campaignId: payload.campaignId,
        instanceId: payload.instanceId,
        status: payload.status,
        jobId: payload.jobId,
        error: payload.error
      }))
    })

    // @ts-ignore
    const offNodeProgress = window.api.on('node:progress', (payload: any) => {
      dispatch(updateNodeProgress({
        campaignId: payload.campaignId,
        instanceId: payload.instanceId,
        message: payload.message
      }))
    })

    // @ts-ignore
    const offCampaignFinished = window.api.on('campaign:finished', (_payload: any) => {
      // Campaign status updates will be picked up by polling
    })

    return () => {
      offUpdate(); offWaiting(); offResolved()
      offCampaignCreated(); offNodeStatus(); offNodeProgress()
      offCampaignFinished()
    }
  }, [dispatch])

  const handleCampaignAction = (event: string, payload: any) => {
    if (event === 'campaign:view-details') {
      setSelectedCampaignId(payload.id)
      return
    }
    // @ts-ignore
    window.api.invoke(event, payload)
  }

  const handleNewCampaign = () => {
    setShowFlowPicker(true)
  }

  const handleFlowSelected = (flowId: string) => {
    setSelectedFlowId(flowId)
    setShowFlowPicker(false)
    setShowWizard(true)
  }

  // Wizard window routes
  if (route.startsWith('/wizard/tiktok-channel-picker')) return <TikTokChannelPicker />
  if (route.startsWith('/wizard/tiktok-video-picker')) return <TikTokVideoPicker />
  if (route.startsWith('/wizard/schedule-setting')) return <ScheduleSetting />
  if (route.startsWith('/wizard/account-picker')) return <AccountPicker />

  return (
    <div className="flex w-full h-screen bg-gray-900 overflow-hidden">
      {selectedCampaignId ? (
        <CampaignDetail
          campaignId={selectedCampaignId}
          onBack={() => setSelectedCampaignId(null)}
        />
      ) : (
        <CampaignList
          onOpenWizard={handleNewCampaign}
          onAction={handleCampaignAction}
        />
      )}
      {showFlowPicker && (
        <WorkflowPicker
          onSelect={handleFlowSelected}
          onClose={() => setShowFlowPicker(false)}
        />
      )}
      {showWizard && (
        <CampaignWizard
          flowId={selectedFlowId}
          onClose={() => setShowWizard(false)}
        />
      )}
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

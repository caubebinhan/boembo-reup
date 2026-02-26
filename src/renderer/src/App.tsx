import { useEffect, useState } from 'react'
import { Provider, useDispatch } from 'react-redux'
import { store } from './store/store'
import { upsertTask } from './store/pipelineSlice'
import { setInteractionWaiting, clearInteraction } from './store/interactionSlice'
import { updateNodeStatus, updateNodeProgress } from './store/nodeEventsSlice'
import { Toaster, toast } from 'sonner'

import { CampaignList } from './components/CampaignList'
import { CampaignDetail } from './components/CampaignDetail'
import { SettingsPanel } from './components/SettingsPanel'
import { TroubleShottingPanel } from './components/TroubleShottingPanel'

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
  const [showWizard, setShowWizard] = useState(false)
  const [showFlowPicker, setShowFlowPicker] = useState(false)
  const [selectedFlowId, setSelectedFlowId] = useState<string>('tiktok-repost')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [homeTab, setHomeTab] = useState<'campaigns' | 'settings' | 'troubleshooting'>('campaigns')
  const dispatch = useDispatch()

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

    // Toast notifications from main process
    // @ts-ignore
    const offToast = window.api.on('app:toast', (payload: any) => {
      const type = payload.type || 'info'
      const msg = payload.message || ''
      const desc = payload.description || undefined
      if (type === 'error') toast.error(msg, { description: desc })
      else if (type === 'success') toast.success(msg, { description: desc })
      else if (type === 'warning') toast.warning(msg, { description: desc })
      else toast.info(msg, { description: desc })
    })

    return () => {
      offUpdate(); offWaiting(); offResolved()
      offCampaignCreated(); offNodeStatus(); offNodeProgress()
      offCampaignFinished(); offToast()
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

  return (
    <div className="flex w-full h-screen bg-gray-900 overflow-hidden">
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#f1f5f9',
            fontSize: '13px',
          },
        }}
        richColors
        closeButton
      />
      {selectedCampaignId ? (
        <CampaignDetail
          campaignId={selectedCampaignId}
          onBack={() => setSelectedCampaignId(null)}
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0 bg-gray-900">
          <div className="px-6 pt-4 pb-2 border-b border-gray-800/60 bg-gradient-to-b from-gray-900 to-gray-900/95">
            <div className="inline-flex rounded-xl border border-gray-800 bg-gray-950/80 p-1 backdrop-blur-sm">
              {(['campaigns', 'settings', 'troubleshooting'] as const).map(tab => {
                const labels = { campaigns: '📋 Campaigns', settings: '⚙️ Settings', troubleshooting: '🔧 Debug' }
                const active = homeTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setHomeTab(tab)}
                    className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    {labels[tab]}
                    {active && (
                      <span className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {homeTab === 'campaigns' ? (
              <CampaignList
                onOpenWizard={handleNewCampaign}
                onAction={handleCampaignAction}
              />
            ) : homeTab === 'settings' ? (
              <SettingsPanel />
            ) : (
              <TroubleShottingPanel />
            )}
          </div>
        </div>
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

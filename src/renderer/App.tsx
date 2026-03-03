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
import { TroubleshootingPanel } from './components/TroubleshootingPanel'

import { CampaignWizard } from './components/CampaignWizard'
import { SplashScreen } from './components/SplashScreen'
import VideoEditorWindow from './components/video-editor/VideoEditorWindow'

// ── Workflow Picker Modal ──────────────────────────
function WorkflowPicker({ onSelect, onClose }: { onSelect: (id: string) => void, onClose: () => void }) {
  const [flows, setFlows] = useState<any[]>([])

  useEffect(() => {
    // @ts-ignore
    window.api.invoke('flow:get-presets').then(setFlows).catch(console.error)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-vintage-charcoal/20 backdrop-blur-sm">
      <div className="bg-vintage-white w-[500px] rounded-2xl shadow-xl border border-vintage-border overflow-hidden">
        <div className="px-6 py-4 border-b border-vintage-border bg-vintage-cream/50">
          <h2 className="text-xl font-medium text-vintage-charcoal">Choose Workflow</h2>
          <p className="text-sm text-vintage-gray mt-1">Select a workflow template for your campaign</p>
        </div>

        <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
          {flows.length === 0 && (
            <div className="text-vintage-gray text-center py-8">No workflows available</div>
          )}
          {flows.map(flow => (
            <button
              key={flow.id}
              onClick={() => onSelect(flow.id)}
              className="w-full text-left p-4 rounded-xl border border-vintage-border hover:border-pastel-blue hover:bg-pastel-blue/20 transition-all duration-300 group cursor-pointer shadow-sm hover:shadow"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl bg-vintage-cream p-2 rounded-lg">{flow.icon || '📋'}</span>
                <div className="flex-1">
                  <div className="font-medium text-vintage-charcoal group-hover:text-blue-900 transition-colors">
                    {flow.name}
                  </div>
                  <div className="text-sm text-vintage-gray mt-1 leading-relaxed">
                    {flow.description || flow.id}
                  </div>
                </div>
                <span className="text-vintage-border group-hover:text-pastel-blue transition-colors">→</span>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-vintage-border bg-vintage-cream/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium text-vintage-gray hover:text-vintage-charcoal hover:bg-vintage-border/50 transition-colors cursor-pointer"
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
      // Open campaign detail in a new window
      // @ts-ignore
      window.api.invoke('campaign-detail:open', { id: payload.id })
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
    <div className="flex w-full h-screen bg-vintage-white overflow-hidden font-[Inter]">
      <Toaster
        theme="light"
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--ev-c-white-soft)',
            border: '1px solid var(--ev-c-gray-3)',
            color: 'var(--ev-c-black)',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
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
        <div className="flex-1 flex flex-col min-w-0 bg-vintage-white">
          <div className="px-8 pt-6 pb-4 border-b border-vintage-border bg-vintage-white z-10">
            <div className="inline-flex rounded-full bg-vintage-cream p-1 shadow-inner">
              {(['campaigns', 'settings', 'troubleshooting'] as const).map(tab => {
                const labels = { campaigns: '📋 Campaigns', settings: '⚙️ Settings', troubleshooting: '🔧 Debug' }
                const active = homeTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setHomeTab(tab)}
                    className={`relative px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer ${active
                      ? 'bg-white text-vintage-charcoal shadow-sm'
                      : 'text-vintage-gray hover:text-vintage-charcoal hover:bg-black/5'
                      }`}
                  >
                    {labels[tab]}
                    {active && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded-t-full bg-pastel-mint opacity-80" />
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
              <TroubleshootingPanel />
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
  // If this window was opened via #/video-editor hash, render the editor
  if (window.location.hash === '#/video-editor') {
    return <VideoEditorWindow />
  }

  // If this window was opened via #/campaign-detail/{id}, render detail standalone
  const detailMatch = window.location.hash.match(/^#\/campaign-detail\/(.+)$/)
  if (detailMatch) {
    return (
      <Provider store={store}>
        <CampaignDetail campaignId={detailMatch[1]} onBack={() => window.close()} />
      </Provider>
    )
  }

  const [splashDone, setSplashDone] = useState(false)

  return (
    <Provider store={store}>
      {!splashDone && <SplashScreen onReady={() => setSplashDone(true)} />}
      {splashDone && <AppContent />}
    </Provider>
  )
}

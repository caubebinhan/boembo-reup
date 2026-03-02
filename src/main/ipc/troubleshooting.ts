import { ipcMain, BrowserWindow } from 'electron'
import { TroubleshootingCaseId, TroubleshootingService } from '../services/TroubleshootingService'
import { jobRepo } from '../db/repositories/JobRepo'

function emitToAll(channel: string, payload: any) {
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send(channel, payload)
    })
  } catch {}
}

export function setupTroubleshootingIPC() {
  ipcMain.handle('troubleshooting:list-cases', async () => {
    return TroubleshootingService.listCases()
  })

  ipcMain.handle('troubleshooting:list-workflows', async () => {
    return TroubleshootingService.listWorkflows()
  })

  ipcMain.handle('troubleshooting:list-runs', async (_event, payload?: { limit?: number }) => {
    return TroubleshootingService.getRuns(payload?.limit || 50)
  })

  ipcMain.handle(
    'troubleshooting:list-video-candidates',
    async (_event, payload?: { workflowId?: string; limit?: number }) => {
      return TroubleshootingService.listVideoCandidates(payload)
    }
  )

  ipcMain.handle(
    'troubleshooting:list-source-candidates',
    async (_event, payload?: { workflowId?: string; limit?: number }) => {
      return TroubleshootingService.listSourceCandidates(payload)
    }
  )

  ipcMain.handle('troubleshooting:clear-runs', async () => {
    return TroubleshootingService.clearRuns()
  })

  ipcMain.handle('troubleshooting:send-run-to-sentry', async (_event, payload?: { runId?: string }) => {
    const runId = payload?.runId
    if (!runId) throw new Error('Missing troubleshooting runId')
    return TroubleshootingService.sendRunToSentry(runId)
  })

  ipcMain.handle('troubleshooting:run-case', async (
    _event,
    payload: {
      caseId: TroubleshootingCaseId
      runtime?: {
        accountId?: string
        videoLocalPath?: string
        videoPlatformId?: string
        videoCampaignId?: string
        sourceName?: string
        sourceType?: string
        sourceCampaignId?: string
        randomSeed?: string | number
      }
    }
  ) => {
    const caseId = payload?.caseId
    if (!caseId) throw new Error('Missing troubleshooting caseId')
    const run = await TroubleshootingService.runCase(caseId, {
      onLog: (runId, entry) => emitToAll('troubleshooting:log', { runId, entry }),
      onUpdate: (record) => emitToAll('troubleshooting:run-update', { record }),
      runtime: payload?.runtime,
    })
    return run
  })

  if (process.env.NODE_ENV === 'test') {
    ipcMain.removeHandler('troubleshooting:test:enqueue-job')
    ipcMain.handle(
      'troubleshooting:test:enqueue-job',
      async (
        _event,
        payload?: {
          campaignId?: string
          workflowId?: string
          nodeId?: string
          instanceId?: string
          data?: Record<string, any>
          scheduledAt?: number
        }
      ) => {
        const campaignId = String(payload?.campaignId || '').trim()
        const workflowId = String(payload?.workflowId || '').trim()
        const nodeId = String(payload?.nodeId || '').trim()
        const instanceId = String(payload?.instanceId || '').trim()
        if (!campaignId || !workflowId || !nodeId || !instanceId) {
          throw new Error('Missing required enqueue payload fields')
        }
        const jobId = jobRepo.createJob({
          campaign_id: campaignId,
          workflow_id: workflowId,
          node_id: nodeId,
          instance_id: instanceId,
          type: 'FLOW_STEP',
          data: payload?.data || {},
          scheduled_at: payload?.scheduledAt || Date.now(),
          status: 'pending',
        })
        return { ok: true, jobId }
      }
    )
  }
}

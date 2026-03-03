import { ipcMain, BrowserWindow } from 'electron'
import { TroubleshootingCaseId, TroubleshootingService } from '../services/TroubleshootingService'
import { jobRepo } from '../db/repositories/JobRepo'
import { CodedError } from '@core/errors/CodedError'

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
    /** @throws DG-050 — Missing runId in IPC request */
    if (!runId) throw new CodedError('DG-050', 'Missing troubleshooting runId')
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
    /** @throws DG-051 — Missing caseId in IPC request */
    if (!caseId) throw new CodedError('DG-051', 'Missing troubleshooting caseId')
    const run = await TroubleshootingService.runCase(caseId, {
      onLog: (runId, entry) => emitToAll('troubleshooting:log', { runId, entry }),
      onUpdate: (record) => emitToAll('troubleshooting:run-update', { record }),
      runtime: payload?.runtime,
    })
    return run
  })

  // ── Per-error troubleshooting handler (production) ──
  ipcMain.handle('troubleshooting:run-for-error', async (
    _event,
    payload: { handlerId: string }
  ) => {
    const handlerId = payload?.handlerId
    /** @throws DG-053 — Missing handlerId */
    if (!handlerId) throw new CodedError('DG-053', 'Missing troubleshooting handlerId')

    // Lazy import to avoid loading all handlers at startup
    const { runHandler } = await import('@core/troubleshooting/handlers/handler-registry')
    const logs: string[] = []
    const logger = (msg: string) => {
      logs.push(msg)
      emitToAll('troubleshooting:handler-log', { handlerId, message: msg })
    }

    const result = await runHandler(handlerId, logger)
    if (!result) {
      return { success: false, title: 'Handler không tìm thấy', message: `Không tìm thấy handler: ${handlerId}`, logs }
    }
    return { ...result, logs }
  })

  // ── Test-only handlers ──
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
        /** @throws DG-052 — Incomplete enqueue payload */
        if (!campaignId || !workflowId || !nodeId || !instanceId) {
          throw new CodedError('DG-052', 'Missing required enqueue payload fields')
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

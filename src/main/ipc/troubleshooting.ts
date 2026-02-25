import { ipcMain, BrowserWindow } from 'electron'
import { TroubleshootingCaseId, TroubleshootingService } from '../services/TroubleshootingService'

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

  ipcMain.handle('troubleshooting:list-runs', async (_event, payload?: { limit?: number }) => {
    return TroubleshootingService.getRuns(payload?.limit || 50)
  })

  ipcMain.handle('troubleshooting:clear-runs', async () => {
    return TroubleshootingService.clearRuns()
  })

  ipcMain.handle('troubleshooting:run-case', async (_event, payload: { caseId: TroubleshootingCaseId }) => {
    const caseId = payload?.caseId
    if (!caseId) throw new Error('Missing troubleshooting caseId')
    const run = await TroubleshootingService.runCase(caseId, {
      onLog: (runId, entry) => emitToAll('troubleshooting:log', { runId, entry }),
      onUpdate: (record) => emitToAll('troubleshooting:run-update', { record }),
    })
    return run
  })
}

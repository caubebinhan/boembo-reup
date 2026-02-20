import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { sessionManager } from '../wizard/WizardSessionManager'
import { WizardWindowManager } from '../wizard/WizardWindowManager'

export function setupWizardIPC() {
  ipcMain.handle(IPC_CHANNELS.WIZARD_START, (_event, { workflowId }) => {
    const session = sessionManager.create(workflowId)
    WizardWindowManager.openStep(session, 0)
    return session.id
  })

  ipcMain.handle(IPC_CHANNELS.WIZARD_GET_SESSION, (_event, { sessionId }) => {
    const session = sessionManager.get(sessionId)
    if (!session) return null
    const { window, ...sessionData } = session
    return sessionData
  })

  ipcMain.handle(IPC_CHANNELS.WIZARD_COMMIT_STEP, (_event, { sessionId, stepKey, data }) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
      
    sessionManager.commitStep(sessionId, stepKey, data)
    
    // Open next step automatically
    WizardWindowManager.openStep(session, session.currentStepIndex + 1)
  })

  ipcMain.handle(IPC_CHANNELS.WIZARD_GO_BACK, (_event, { sessionId }) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    
    const prevIndex = Math.max(0, session.currentStepIndex - 1)
    WizardWindowManager.openStep(session, prevIndex)
  })

  ipcMain.handle('account:list', async () => {
    // Return mock accounts for now since PublishAccountService is stubbed
    return [
      { id: 'acc1', username: 'Test Account 1', handle: '@testacc1', status: 'active' },
      { id: 'acc2', username: 'Test Account 2', handle: '@testacc2', status: 'active' }
    ]
  })

  ipcMain.handle('account:add', async () => {
    return true
  })
}

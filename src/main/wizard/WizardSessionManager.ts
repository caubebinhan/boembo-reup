import { BrowserWindow } from 'electron'
import { nanoid } from 'nanoid'
import { WizardSessionData } from '../../shared/ipc-types'

export interface WizardSession extends WizardSessionData {
  window: BrowserWindow | null
}

export class WizardSessionManager {
  private sessions = new Map<string, WizardSession>()

  create(workflowId: string): WizardSession {
    const session: WizardSession = {
      id: nanoid(),
      workflowId,
      outputs: {},
      currentStepIndex: 0,
      window: null
    }
    this.sessions.set(session.id, session)
    return session
  }

  get(id: string): WizardSession | undefined {
    return this.sessions.get(id)
  }

  commitStep(id: string, stepKey: string, data: any): void {
    const session = this.get(id)
    if (!session) throw new Error(`Wizard session ${id} not found`)
    
    // Override if user goes back then next again -> outputs are not deleted
    session.outputs[stepKey] = data
  }

  delete(id: string): void {
    const session = this.get(id)
    if (session?.window && !session.window.isDestroyed()) {
      session.window.close()
    }
    this.sessions.delete(id)
  }
}

export const sessionManager = new WizardSessionManager()

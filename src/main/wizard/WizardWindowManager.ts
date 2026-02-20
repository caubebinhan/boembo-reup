import { BrowserWindow } from 'electron'
import { join } from 'path'
import { WizardSession, sessionManager } from './WizardSessionManager'
import { PipelineEventBus } from '../../core/engine/PipelineEventBus'

export class WizardWindowManager {
  // Ordered step routes for the TikTok Repost workflow
  private static readonly WORKFLOW_STEPS: Record<string, string[]> = {
    'tiktok-repost': [
      '/wizard/tiktok-channel-picker',
      '/wizard/tiktok-video-picker',
      '/wizard/schedule-setting',
      '/wizard/account-picker'
    ]
  }

  static openStep(session: WizardSession, stepIndex: number): void {
    const steps = this.WORKFLOW_STEPS[session.workflowId]
    if (!steps) throw new Error(`Unknown workflow ${session.workflowId}`)
    
    // Close existing window if any
    if (session.window && !session.window.isDestroyed()) {
      session.window.close()
    }

    if (stepIndex >= steps.length) {
      // Wizard finished
      this.finishWizard(session)
      return
    }

    const route = steps[stepIndex]
    session.currentStepIndex = stepIndex

    const wizardWindow = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    session.window = wizardWindow

    wizardWindow.on('ready-to-show', () => {
      wizardWindow.show()
    })

    // URL management
    const baseUrl = process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}#${route}?sessionId=${session.id}`
      : `file://${join(__dirname, '../renderer/index.html')}#${route}?sessionId=${session.id}`

    if (process.env['ELECTRON_RENDERER_URL']) {
      wizardWindow.loadURL(baseUrl)
    } else {
      wizardWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: `${route}?sessionId=${session.id}` })
    }
  }

  private static finishWizard(session: WizardSession) {
    // Notify main process to create campaign
    PipelineEventBus.emit('wizard:done', { session })
    sessionManager.delete(session.id)
  }
}

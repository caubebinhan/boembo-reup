import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { PipelineEventBus } from '../core/engine/PipelineEventBus'
import { VideoQueueRepo } from './db/VideoQueueRepo'
import { initDb, db } from './db/Database'
import { setupWizardIPC } from './ipc/wizard'
import { initSentry } from './sentry'
import { flowEngine } from '../core/engine/FlowEngine'
import { setupCampaignIPC } from './ipc/campaigns'
import { setupScannerIPC } from './ipc/scanner'
import { CrashRecoveryService } from './services/CrashRecovery'
import { flowLoader } from '../core/flow/FlowLoader'

// Sentry
if (!app.isPackaged || process.env.NODE_ENV === 'development') {
  initSentry()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Wire PipelineEventBus to renderer
  PipelineEventBus.on('node:done', ({ result, ctx }) => {
    if (result.data?.video_id || ctx.variables.current_video?.id) {
      const vid = result.data?.video_id || ctx.variables.current_video?.id
      // Update DB
      VideoQueueRepo.updateStatus(vid, result.status)
      // Push to UI
      mainWindow.webContents.send('pipeline:update', {
        campaignId: ctx.campaignId,
        videoId: vid,
        status: result.status,
        scheduledAt: result.data?.scheduled_at
      })
    }
  })

  PipelineEventBus.on('pipeline:interaction_waiting', (payload) => {
    mainWindow.webContents.send('pipeline:interaction_waiting', payload)
  })
  
  PipelineEventBus.on('pipeline:interaction_resolved', (payload) => {
    mainWindow.webContents.send('pipeline:interaction_resolved', payload)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Handle wizard completion
  PipelineEventBus.on('wizard:done', ({ session }) => {
    const campaignId = require('crypto').randomBytes(4).toString('hex')
    const campaign = {
      id: campaignId,
      name: `Campaign ${new Date().toLocaleString()}`,
      workflow_id: session.workflowId,
      params: JSON.stringify(session.outputs),
      status: 'idle',
      created_at: Date.now(),
      updated_at: Date.now()
    }
    
    try {
      db.prepare(`
        INSERT INTO campaigns (id, name, workflow_id, params, status, created_at, updated_at)
        VALUES (@id, @name, @workflow_id, @params, @status, @created_at, @updated_at)
      `).run(campaign)

      mainWindow.webContents.send('campaign:created', { ...campaign, params: session.outputs })
      
      flowEngine.triggerCampaign(campaignId)
    } catch (err) {
      console.error('Failed to save campaign:', err)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.repostio.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb()
  CrashRecoveryService.recoverPendingTasks()
  
  // Initialize FlowLoader
  const flowsDir = join(__dirname, '../../src/flows/presets')
  console.log('Loading yaml flows from:', flowsDir)
  const flows = flowLoader.loadAll(flowsDir)
  console.log(`Loaded ${flows.length} flows`)

  // Initialize Engine
  flowEngine.start()

  setupCampaignIPC()
  setupScannerIPC()
  setupWizardIPC()
  
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

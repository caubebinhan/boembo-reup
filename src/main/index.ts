import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { PipelineEventBus } from '../core/engine/PipelineEventBus'

import { initDb } from './db/Database'
import { setupWizardIPC } from './ipc/wizard'
import { initSentry } from './sentry'
import { flowEngine } from '../core/engine/FlowEngine'
import { setupCampaignIPC } from './ipc/campaigns'
import { setupScannerIPC } from './ipc/scanner'
import { setupSettingsIPC } from './ipc/settings'
import { setupTroubleshootingIPC } from './ipc/troubleshooting'
import { CrashRecoveryService } from './services/CrashRecovery'
import { flowLoader } from '../core/flow/FlowLoader'
// Importing the nodes barrel triggers self-registration of all nodes.
// To add a new node: create the file, export + call nodeRegistry.register(), then add to src/nodes/index.ts
import '../nodes'
// Importing the workflows barrel triggers auto-discovery of all workflow modules
// (recovery, ipc, services, events) — no manual imports needed.
import '../workflows'

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

  PipelineEventBus.on('pipeline:interaction_waiting', (payload) => {
    mainWindow.webContents.send('pipeline:interaction_waiting', payload)
  })
  
  PipelineEventBus.on('pipeline:interaction_resolved', (payload) => {
    mainWindow.webContents.send('pipeline:interaction_resolved', payload)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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
  
  // Initialize FlowLoader — scan src/workflows/*/flow.yaml
  const flowsDir = join(__dirname, '../../src/workflows')
  console.log('Loading yaml flows from:', flowsDir)
  const flows = flowLoader.loadAll(flowsDir)
  console.log(`Loaded ${flows.length} flows`)

  // Initialize Engine
  flowEngine.start()

  setupCampaignIPC()
  setupScannerIPC()
  setupWizardIPC()
  setupSettingsIPC()
  setupTroubleshootingIPC()
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

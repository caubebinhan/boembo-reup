import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { PipelineEventBus } from '../core/engine/PipelineEventBus'

import { initDb } from './db/Database'
import { setupWizardIPC } from './ipc/wizard'
import { setupVideoEditorIPC } from './ipc/video-editor'
import { setupAccountsIPC } from './ipc/accounts'
import { initSentry } from './sentry'
import { runtimeProjectionService } from './services/RuntimeProjectionService'
import { flowEngine } from '../core/engine/FlowEngine'
import { setupCampaignIPC } from './ipc/campaigns'
import { setupSettingsIPC } from './ipc/settings'
import { setupTroubleshootingIPC } from './ipc/troubleshooting'
import { CrashRecoveryService } from './services/CrashRecovery'
import { serviceHealthMonitor } from './services/ServiceHealthMonitor'
import { flowLoader } from '../core/flow/FlowLoader'
import { asyncTaskScheduler } from './services/AsyncTaskScheduler'
// Importing the nodes barrel triggers self-registration of all nodes.
// To add a new node: create the file, export + call nodeRegistry.register(), then add to src/nodes/index.ts
import '../nodes'
// Importing the workflows barrel triggers auto-discovery of all workflow modules
// (recovery, ipc, services, events) - no manual imports needed.
import '../workflows'

// Register local-thumb:// scheme before app is ready (required by Electron)
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-thumb', privileges: { secure: true, supportFetchAPI: true, stream: true } },
])

// Sentry (production DSN if configured)
initSentry()

// Expose Chrome DevTools Protocol port for debugging (set E2E_CDP_PORT=9222 to enable)
const cdpPort = process.env.E2E_CDP_PORT?.trim()
if (cdpPort) {
  app.commandLine.appendSwitch('remote-debugging-port', cdpPort)
  console.log(`[CDP] Remote debugging enabled on port ${cdpPort}`)
}

function createWindow(): void {
  const headlessFlag = String(process.env.E2E_HEADLESS || '').trim().toLowerCase()
  const isE2EHeadless = headlessFlag === '1' || headlessFlag === 'true'
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false, // Allow local file access for video preview etc.
    }
  })

  const safeSend = (channel: string, payload: unknown) => {
    try {
      if (mainWindow.isDestroyed()) return
      const wc = mainWindow.webContents
      if (!wc || wc.isDestroyed()) return
      wc.send(channel, payload)
    } catch {
      // Window may be closing while background pipeline events are emitted.
    }
  }

  const onInteractionWaiting = (payload: unknown) => {
    safeSend('pipeline:interaction_waiting', payload)
  }

  const onInteractionResolved = (payload: unknown) => {
    safeSend('pipeline:interaction_resolved', payload)
  }

  PipelineEventBus.on('pipeline:interaction_waiting', onInteractionWaiting)
  PipelineEventBus.on('pipeline:interaction_resolved', onInteractionResolved)

  mainWindow.on('ready-to-show', () => {
    if (!isE2EHeadless) mainWindow.show()
  })

  mainWindow.on('closed', () => {
    PipelineEventBus.off('pipeline:interaction_waiting', onInteractionWaiting)
    PipelineEventBus.off('pipeline:interaction_resolved', onInteractionResolved)
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
  
  // Initialize FlowLoader - scan src/workflows/*/flow.yaml
  const flowsDir = join(__dirname, '../../src/workflows')
  console.log('Loading yaml flows from:', flowsDir)
  const flows = flowLoader.loadAll(flowsDir)
  console.log(`Loaded ${flows.length} flows`)

  // Recover pending tasks AFTER flows are loaded (needs flow definitions)
  CrashRecoveryService.recoverPendingTasks()

  // Initialize Engine
  flowEngine.start()
  runtimeProjectionService.start()

  // Start runtime service health monitor (pings workflow URLs periodically)
  serviceHealthMonitor.start()

  // Initialize Async Task Scheduler (handlers self-register from their modules)
  asyncTaskScheduler.start()

  setupCampaignIPC()
  setupWizardIPC()
  setupVideoEditorIPC()
  setupAccountsIPC()
  setupSettingsIPC()
  setupTroubleshootingIPC()
  // Register local-thumb:// protocol to serve local thumbnail files
  // Bypassing file:// which is blocked by Electron's webSecurity
  protocol.handle('local-thumb', async (request) => {
    const filePath = decodeURIComponent(request.url.slice('local-thumb://'.length))
    try { return await net.fetch(`file:///${filePath.replace(/\\/g, '/')}`) }
    catch { return new Response('not found', { status: 404 }) }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    asyncTaskScheduler.stop()
    app.quit()
  }
})


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

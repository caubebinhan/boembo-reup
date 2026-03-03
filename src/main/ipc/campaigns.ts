import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-types'
import * as crypto from 'node:crypto'
import { flowLoader } from '@core/flow/FlowLoader'
import { FlowResolver } from '@core/flow/FlowResolver'
import { flowEngine } from '@core/engine/FlowEngine'
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { nodeRegistry } from '@core/nodes/NodeRegistry'
import { campaignRepo } from '../db/repositories/CampaignRepo'
import { jobRepo } from '../db/repositories/JobRepo'
import { createCampaignDocument } from '../db/models/Campaign'
import { db } from '../db/Database'

/**
 * Safe IPC wrapper — catches all errors and returns structured { success, error } responses
 * so the renderer can always display meaningful error messages.
 */
function safeHandle(channel: string, handler: (...args: any[]) => Promise<any>) {
  ipcMain.handle(channel, async (...args) => {
    try {
      return await handler(...args)
    } catch (err: any) {
      const message = err?.message || String(err)
      console.error(`[IPC:${channel}] Error:`, message)
      ExecutionLogger.sendToast('error', `IPC Error: ${channel}`, message)
      throw err // Re-throw so renderer sees the rejection
    }
  })
}

export function setupCampaignIPC() {
  safeHandle(IPC_CHANNELS.CAMPAIGN_LIST, async () => {
    return campaignRepo.findAll()
  })

  // Open campaign detail in a new window
  safeHandle('campaign-detail:open', async (_event, { id }: { id: string }) => {
    const { join } = require('node:path')
    const { is } = require('@electron-toolkit/utils')
    const detailWin = new BrowserWindow({
      width: 1100,
      height: 750,
      title: 'Campaign Detail',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: false,
      }
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await detailWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/campaign-detail/${id}`)
    } else {
      await detailWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/campaign-detail/${id}` })
    }
  })

  safeHandle(IPC_CHANNELS.CAMPAIGN_GET, async (_event, { id }) => {
    return campaignRepo.findById(id)
  })

  safeHandle(IPC_CHANNELS.CAMPAIGN_CREATE, async (_event, payload) => {
    const flow = flowLoader.get(payload.workflow_id || 'tiktok-repost')
    const doc = createCampaignDocument({
      id: crypto.randomBytes(4).toString('hex'),
      name: payload.name || `Campaign ${new Date().toLocaleString()}`,
      workflow_id: payload.workflow_id || 'tiktok-repost',
      workflow_version: flow?.version || '1.0',
      params: payload,
      flow_snapshot: flow ?? null,
    })

    campaignRepo.save(doc)

    BrowserWindow.getAllWindows().forEach(w => {
      try {
        w.webContents.send('campaign:created', doc)
        w.webContents.send('campaigns-updated')
      } catch (e) {
        // Window may be destroyed
      }
    })

    return doc
  })

  //  Campaign Delete (cascade: jobs, async_tasks, execution_logs)
  safeHandle(IPC_CHANNELS.CAMPAIGN_DELETE, async (_event, { id }) => {
    const deleteCascade = db.transaction((campaignId: string) => {
      db.prepare('DELETE FROM jobs WHERE campaign_id = ?').run(campaignId)
      db.prepare('DELETE FROM async_tasks WHERE campaign_id = ?').run(campaignId)
      db.prepare('DELETE FROM execution_logs WHERE campaign_id = ?').run(campaignId)
      campaignRepo.delete(campaignId)
    })
    deleteCascade(id)
    return true
  })

  //  Run / Pause / Resume 
  safeHandle(IPC_CHANNELS.CAMPAIGN_TRIGGER, async (_event, { id }) => {
    flowEngine.triggerCampaign(id)
    return true
  })

  safeHandle(IPC_CHANNELS.CAMPAIGN_PAUSE, async (_event, { id }) => {
    flowEngine.pauseCampaign(id)
    return true
  })

  safeHandle(IPC_CHANNELS.CAMPAIGN_RESUME, async (_event, { id }) => {
    flowEngine.resumeCampaign(id)
    return true
  })

  safeHandle(IPC_CHANNELS.CAMPAIGN_TOGGLE_STATUS, async (_event, { id }) => {
    const doc = campaignRepo.findById(id)
    if (doc) {
      if (doc.status === 'active' || doc.status === 'running') {
        flowEngine.pauseCampaign(id)
      } else {
        flowEngine.resumeCampaign(id)
      }
    }
    return true
  })

  //  Flow presets 
  safeHandle('flow:get-presets', async () => {
    return flowLoader.getAll().map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      icon: f.icon,
      color: f.color,
      tags: f.nodes.map(n => n.node_id),
    }))
  })

  safeHandle('flow:list', async () => {
    return flowLoader.getAll().map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      icon: f.icon,
      color: f.color,
    }))
  })

  safeHandle('flow:get-ui-descriptor', async (_event, flowId) => {
    const flow = flowLoader.get(flowId)
    return flow?.ui || null
  })

  //  Jobs & Flow Nodes 
  safeHandle(IPC_CHANNELS.CAMPAIGN_GET_JOBS, async (_event, { id }) => {
    return jobRepo.findByCampaign(id)
  })

  safeHandle(IPC_CHANNELS.CAMPAIGN_GET_FLOW_NODES, async (_event, { workflowId, campaignId }) => {
    // Use campaign snapshot if available, else latest
    const flow = campaignId ? FlowResolver.resolve(campaignId) : flowLoader.get(workflowId)
    if (!flow) return null
    return {
      nodes: flow.nodes.map(n => {
        const manifest = nodeRegistry.get(n.node_id)?.manifest
        return {
          node_id: n.node_id,
          instance_id: n.instance_id,
          children: n.children,
          execution: (n as any).execution,
          // visualizer meta  - sourced from each node's manifest.ts
          icon: manifest?.icon,
          label: manifest?.label || manifest?.name,
          color: manifest?.color,
          description: manifest?.description,
          editable_settings: manifest?.editable_settings || null,
          on_save_event: manifest?.on_save_event || null,
        }
      }),
      edges: flow.edges.map(e => ({
        from: e.from,
        to: e.to,
        when: e.when,
      })),
    }
  })

  //  Execution Logs 
  safeHandle('campaign:get-logs', async (_event, { id, limit }) => {
    return ExecutionLogger.getLogsForCampaign(id, limit || 200)
  })

  //  Node Progress 
  safeHandle('campaign:get-node-progress', async (_event, { id }) => {
    return db.prepare(`
      SELECT e.instance_id, e.message
      FROM execution_logs e
      INNER JOIN (
        SELECT instance_id, MAX(created_at) as max_ts
        FROM execution_logs
        WHERE campaign_id = ? AND event = 'node:progress'
        GROUP BY instance_id
      ) latest ON e.instance_id = latest.instance_id AND e.created_at = latest.max_ts
      WHERE e.campaign_id = ? AND e.event = 'node:progress'
    `).all(id, id)
  })

  //  Per-Video Event History 
  safeHandle('campaign:get-video-events', async (_event, { campaignId, videoId, limit }) => {
    return db.prepare(`
      SELECT event, message, data_json as data, created_at
      FROM execution_logs
      WHERE campaign_id = ?
        AND (
          json_extract(data_json, '$.videoId') = ?
          OR json_extract(data_json, '$.platform_id') = ?
          OR message LIKE ?
        )
      ORDER BY created_at ASC
      LIMIT ?
    `).all(campaignId, videoId, videoId, `%${videoId}%`, limit || 100)
  })

  //  Update campaign params (merge) 
  safeHandle(IPC_CHANNELS.CAMPAIGN_UPDATE_PARAMS, async (_event, { id, params }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return { success: false, error: 'Campaign not found' }
    Object.assign(store.doc.params, params)
    store.save()
    BrowserWindow.getAllWindows().forEach(w => {
      try {
        w.webContents.send('campaign:params-updated', { id, params: store.doc.params })
      } catch (e) {
        // Window may be destroyed
      }
    })
    return { success: true, params: store.doc.params }
  })

  //  Trigger event on campaign (e.g. reschedule) 
  safeHandle('campaign:trigger-event', async (_event, { id, event, params }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return { success: false, error: 'Campaign not found' }

    if (event === 'reschedule') {
      const intervalMinutes = params?.intervalMinutes ?? store.doc.params?.intervalMinutes ?? 60
      const intervalMs = intervalMinutes * 60 * 1000
      const videos = store.videos
      if (videos.length === 0) return { success: true, message: 'No videos to reschedule' }

      const TERMINAL = ['published', 'failed', 'publish_failed']
      let cursor = Date.now()
      let queueIdx = 0
      for (let i = 0; i < videos.length; i++) {
        if (TERMINAL.includes(videos[i].status)) continue
        videos[i].scheduled_for = cursor
        videos[i].queue_index = queueIdx++
        videos[i].status = 'queued'
        cursor += intervalMs
      }
      store.lastProcessedIndex = 0
      store.save()

      BrowserWindow.getAllWindows().forEach(w => {
        try {
          w.webContents.send('campaigns-updated')
          w.webContents.send('campaign:params-updated', { id, params: store.doc.params })
        } catch (e) {
          // Window may be destroyed
        }
      })
      return { success: true, message: `Rescheduled ${videos.length} videos with ${intervalMinutes}min interval` }
    }

    return { success: false, error: `Unknown event: ${event}` }
  })

  // ── Pipeline: Retry node (user-initiated from Visualizer) ──
  safeHandle('pipeline:retry-node', async (_event, { campaignId, instanceId }: { campaignId: string; instanceId: string }) => {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return { success: false, error: 'Campaign not found' }

    const flow = FlowResolver.resolve(campaignId)
    if (!flow) return { success: false, error: 'Flow not found for campaign' }

    const nodeDef = flow.nodes.find(n => n.instance_id === instanceId)
    if (!nodeDef) return { success: false, error: `Node ${instanceId} not found in flow` }

    // Ensure campaign is active
    if (store.status !== 'active' && store.status !== 'paused') {
      store.status = 'active'
      store.save()
    }

    // Create a new job for this node (manual retry, _retryCount = 0)
    const jobId = jobRepo.createJob({
      campaign_id: campaignId,
      workflow_id: store.doc.workflow_id,
      node_id: nodeDef.node_id,
      instance_id: instanceId,
      type: 'FLOW_STEP',
      data: { _retryCount: 0, _manualRetry: true },
      scheduled_at: Date.now(),
    })

    ExecutionLogger.campaignEvent(campaignId, 'pipeline:manual-retry',
      `Manual retry for node "${instanceId}" (job: ${jobId})`)

    return { success: true, jobId }
  })

  // ── Pipeline: Skip node (user-initiated from NodeErrorModal) ──
  safeHandle('pipeline:skip-node', async (_event, { campaignId, instanceId }: { campaignId: string; instanceId: string }) => {
    // Mark recent failed jobs for this instance as 'skipped'
    const failedJobs = db.prepare(`
      SELECT id FROM jobs
      WHERE campaign_id = ? AND instance_id = ? AND status = 'failed'
      ORDER BY created_at DESC LIMIT 5
    `).all(campaignId, instanceId) as { id: string }[]

    for (const job of failedJobs) {
      jobRepo.updateStatus(job.id, 'skipped')
    }

    ExecutionLogger.campaignEvent(campaignId, 'pipeline:manual-skip',
      `User skipped node "${instanceId}" (${failedJobs.length} jobs marked skipped)`)

    return { success: true, skippedCount: failedJobs.length }
  })
}

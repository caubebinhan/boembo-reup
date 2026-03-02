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

export function setupCampaignIPC() {
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_LIST, async () => {
    return campaignRepo.findAll()
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_GET, async (_event, { id }) => {
    return campaignRepo.findById(id)
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_CREATE, async (_event, payload) => {
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
      w.webContents.send('campaign:created', doc)
      w.webContents.send('campaigns-updated')
    })

    return doc
  })

  //  Campaign Delete (cascade: jobs, async_tasks, execution_logs)
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_DELETE, async (_event, { id }) => {
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
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_TRIGGER, async (_event, { id }) => {
    flowEngine.triggerCampaign(id)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_PAUSE, async (_event, { id }) => {
    flowEngine.pauseCampaign(id)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_RESUME, async (_event, { id }) => {
    flowEngine.resumeCampaign(id)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_TOGGLE_STATUS, async (_event, { id }) => {
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
  ipcMain.handle('flow:get-presets', async () => {
    return flowLoader.getAll().map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      icon: f.icon,
      color: f.color,
      tags: f.nodes.map(n => n.node_id),
    }))
  })

  ipcMain.handle('flow:list', async () => {
    return flowLoader.getAll().map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      icon: f.icon,
      color: f.color,
    }))
  })

  ipcMain.handle('flow:get-ui-descriptor', async (_event, flowId) => {
    const flow = flowLoader.get(flowId)
    return flow?.ui || null
  })

  //  Jobs & Flow Nodes 
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_GET_JOBS, async (_event, { id }) => {
    return jobRepo.findByCampaign(id)
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_GET_FLOW_NODES, async (_event, { workflowId, campaignId }) => {
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
  ipcMain.handle('campaign:get-logs', async (_event, { id, limit }) => {
    return ExecutionLogger.getLogsForCampaign(id, limit || 200)
  })

  //  Node Progress 
  ipcMain.handle('campaign:get-node-progress', async (_event, { id }) => {
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
  ipcMain.handle('campaign:get-video-events', async (_event, { campaignId, videoId, limit }) => {
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
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_UPDATE_PARAMS, async (_event, { id, params }) => {
    const store = campaignRepo.tryOpen(id)
    if (!store) return { success: false, error: 'Campaign not found' }
    Object.assign(store.doc.params, params)
    store.save()
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('campaign:params-updated', { id, params: store.doc.params })
    })
    return { success: true, params: store.doc.params }
  })

  //  Trigger event on campaign (e.g. reschedule) 
  ipcMain.handle('campaign:trigger-event', async (_event, { id, event, params }) => {
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
        w.webContents.send('campaigns-updated')
        w.webContents.send('campaign:params-updated', { id, params: store.doc.params })
      })
      return { success: true, message: `Rescheduled ${videos.length} videos with ${intervalMinutes}min interval` }
    }

    return { success: false, error: `Unknown event: ${event}` }
  })
}

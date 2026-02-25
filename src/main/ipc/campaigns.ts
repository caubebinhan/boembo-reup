import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { db } from '../db/Database'
import * as crypto from 'crypto'
import { flowLoader } from '../../core/flow/FlowLoader'
import { flowEngine } from '../../core/engine/FlowEngine'
import { ExecutionLogger } from '../../core/engine/ExecutionLogger'

export function setupCampaignIPC() {
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_LIST, async () => {
    const records = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all() as any[]
    return records.map(r => ({
      ...r,
      config_json: r.params
    }))
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_GET, async (_event, { id }) => {
    const record = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any
    if (!record) return null
    return { ...record, config_json: record.params }
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_CREATE, async (_event, payload) => {
    const campaignId = crypto.randomBytes(4).toString('hex')
    const campaign = {
      id: campaignId,
      name: payload.name || `Campaign ${new Date().toLocaleString()}`,
      workflow_id: payload.workflow_id || 'tiktok-repost',
      params: JSON.stringify(payload),
      status: 'idle',
      created_at: Date.now(),
      updated_at: Date.now(),
      queued_count: 0,
      downloaded_count: 0,
      published_count: 0,
      failed_count: 0
    }
    
    db.prepare(`
      INSERT INTO campaigns (id, name, workflow_id, params, status, created_at, updated_at, queued_count, downloaded_count, published_count, failed_count)
      VALUES (@id, @name, @workflow_id, @params, @status, @created_at, @updated_at, @queued_count, @downloaded_count, @published_count, @failed_count)
    `).run(campaign)

    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('campaign:created', { ...campaign, params: payload })
      w.webContents.send('campaigns-updated')
    })

    return campaign
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_DELETE, async (_event, { id }) => {
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
    db.prepare('DELETE FROM execution_logs WHERE campaign_id = ?').run(id)
    return true
  })

  // ── Run / Pause / Resume ─────────────────────────
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
    const record = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id) as any
    if (record) {
      if (record.status === 'active' || record.status === 'running') {
        flowEngine.pauseCampaign(id)
      } else {
        flowEngine.resumeCampaign(id)
      }
    }
    return true
  })

  // ── Flow presets ─────────────────────────────────
  ipcMain.handle('flow:get-presets', async () => {
    return flowLoader.getAll().map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      icon: f.icon,
      color: f.color,
      tags: f.nodes.map(n => n.node_id)
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

  // ── Jobs & Flow Nodes ────────────────────────────
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_GET_JOBS, async (_event, { id }) => {
    return db.prepare(
      'SELECT * FROM jobs WHERE campaign_id = ? ORDER BY created_at DESC'
    ).all(id) as any[]
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_GET_FLOW_NODES, async (_event, { workflowId }) => {
    const flow = flowLoader.get(workflowId)
    if (!flow) return null
    return {
      nodes: flow.nodes.map(n => ({
        node_id: n.node_id,
        instance_id: n.instance_id,
        children: n.children,
        execution: n.execution
      })),
      edges: flow.edges.map(e => ({
        from: e.from,
        to: e.to,
        when: e.when
      }))
    }
  })

  // ── Videos by campaign ─────────────────────────────
  ipcMain.handle('campaign:get-videos', async (_event, { id }) => {
    return db.prepare(
      'SELECT * FROM videos WHERE campaign_id = ? ORDER BY queue_index ASC'
    ).all(id) as any[]
  })

  // ── Execution Logs ───────────────────────────────
  ipcMain.handle('campaign:get-logs', async (_event, { id, limit }) => {
    return ExecutionLogger.getLogsForCampaign(id, limit || 200)
  })

  // ── Show video file in system explorer ────────────
  ipcMain.handle('video:show-in-explorer', async (_event, payload) => {
    const { shell } = await import('electron')
    const path = typeof payload === 'string' ? payload : payload?.path
    if (path) shell.showItemInFolder(path)
  })

  // ── Reschedule a video's scheduled_for time ───────
  ipcMain.handle('video:reschedule', async (_event, { platformId, campaignId, scheduledFor }) => {
    db.prepare(
      'UPDATE videos SET scheduled_for = ? WHERE platform_id = ? AND campaign_id = ?'
    ).run(scheduledFor, platformId, campaignId)
    return { success: true }
  })
}

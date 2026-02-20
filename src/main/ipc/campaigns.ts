import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { db } from '../db/Database'
import * as crypto from 'crypto'
import { flowLoader } from '../core/flow/FlowLoader'

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
      workflow_id: 'tiktok-repost', // hardcoded default
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

    // Notify UI
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('campaign:created', { ...campaign, params: payload })
      w.webContents.send('campaigns-updated')
    })

    return campaign
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_DELETE, async (_event, { id }) => {
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_TRIGGER, async (_event, { id }) => {
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('active', id)
    const { flowEngine } = require('../core/engine/FlowEngine')
    flowEngine.triggerCampaign(id)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_PAUSE, async (_event, { id }) => {
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('paused', id)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_TOGGLE_STATUS, async (_event, { id }) => {
    const record = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id) as any
    if (record) {
      const newStatus = record.status === 'active' || record.status === 'running' ? 'paused' : 'active'
      db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(newStatus, id)
    }
    return true
  })

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

  ipcMain.handle('flow:get-ui-descriptor', async (_event, flowId) => {
    const flow = flowLoader.get(flowId)
    return flow?.ui || null
  })
}

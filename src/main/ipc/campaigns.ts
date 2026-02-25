import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { db } from '../db/Database'
import * as crypto from 'crypto'
import { flowLoader } from '../../core/flow/FlowLoader'
import { flowEngine } from '../../core/engine/FlowEngine'
import { ExecutionLogger } from '../../core/engine/ExecutionLogger'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'
import { normalizeTimeRanges, nextValidSlot } from '../../nodes/_shared/timeWindow'

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
      nodes: flow.nodes.map(n => {
        const manifest = nodeRegistry.get(n.node_id)?.manifest
        return {
          node_id: n.node_id,
          instance_id: n.instance_id,
          children: n.children,
          execution: n.execution,
          editable_settings: manifest?.editable_settings || null,
          on_save_event: manifest?.on_save_event || null,
        }
      }),
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

  // ── Node Progress ────────────────────────────────
  ipcMain.handle('campaign:get-node-progress', async (_event, { id }) => {
    // Get the latest progress message for each node instance in this campaign
    return db.prepare(`
      SELECT instance_id, message 
      FROM execution_logs 
      WHERE campaign_id = ? AND event = 'node:progress'
      GROUP BY instance_id
      HAVING created_at = MAX(created_at)
    `).all(id)
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

  // ── Update campaign params (merge) ────────────────
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_UPDATE_PARAMS, async (_event, { id, params }) => {
    const record = db.prepare('SELECT params FROM campaigns WHERE id = ?').get(id) as any
    if (!record) return { success: false, error: 'Campaign not found' }
    const current = typeof record.params === 'string' ? JSON.parse(record.params) : record.params || {}
    const merged = { ...current, ...params }
    db.prepare('UPDATE campaigns SET params = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(merged), Date.now(), id)
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('campaign:params-updated', { id, params: merged })
    })
    return { success: true, params: merged }
  })

  // ── Reschedule ALL queued videos with new params ──
  ipcMain.handle(IPC_CHANNELS.CAMPAIGN_RESCHEDULE_ALL, async (_event, { id }) => {
    const record = db.prepare('SELECT params FROM campaigns WHERE id = ?').get(id) as any
    if (!record) return { success: false, error: 'Campaign not found' }
    const params = typeof record.params === 'string' ? JSON.parse(record.params) : record.params || {}
    const intervalMinutes = params.intervalMinutes ?? 60
    const intervalMs = intervalMinutes * 60 * 1000
    const ranges = normalizeTimeRanges(params)

    const videos = db.prepare(
      "SELECT platform_id, queue_index, data_json FROM videos WHERE campaign_id = ? AND status IN ('queued') ORDER BY queue_index ASC"
    ).all(id) as any[]

    if (videos.length === 0) return { success: true, count: 0 }

    let cursor = Date.now()
    const update = db.prepare('UPDATE videos SET scheduled_for = ? WHERE platform_id = ? AND campaign_id = ?')

    const tx = db.transaction(() => {
      for (const v of videos) {
        cursor = nextValidSlot(cursor, ranges)
        update.run(cursor, v.platform_id, id)
        cursor += intervalMs
      }
    })
    tx()

    ExecutionLogger.log({
      campaign_id: id,
      instance_id: 'scheduler_1',
      node_id: 'core.video_scheduler',
      level: 'info',
      event: 'videos:rescheduled',
      message: `📋 ${videos.length} videos rescheduled (interval=${intervalMinutes}min)`,
    })

    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('campaigns-updated')
    })

    return { success: true, count: videos.length }
  })
}

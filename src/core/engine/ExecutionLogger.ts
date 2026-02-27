import { db } from '@main/db/Database'
import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'

export interface LogEntry {
  campaign_id: string
  job_id?: string
  instance_id?: string
  node_id?: string
  level: 'info' | 'warn' | 'error' | 'debug' | 'progress'
  event: string
  message: string
  data?: any
}

/**
 * Centralized execution logger: writes to console + SQLite + IPC  
 * Every node execution, event, and error goes through here.
 */
/** Internal EventEmitter for main-process listeners (e.g. workflow events.ts) */
const _bus = new EventEmitter()
_bus.setMaxListeners(50)

export class ExecutionLogger {
  /** Emit to all renderer windows via IPC */
  static emitToRenderer(event: string, payload: any) {
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send(event, payload)
        }
      })
    } catch (_) { /* window may not exist */ }
  }
  private static emitToUI(event: string, payload: any) { this.emitToRenderer(event, payload) }

  /** Log a structured entry */
  static log(entry: LogEntry) {
    const timestamp = Date.now()
    const prefix = `[${entry.level.toUpperCase()}][${entry.campaign_id}][${entry.instance_id || '-'}]`

    // 1) Console
    if (entry.level === 'error') {
      console.error(`${prefix} ${entry.event}: ${entry.message}`, entry.data || '')
    } else if (entry.level === 'warn') {
      console.warn(`${prefix} ${entry.event}: ${entry.message}`)
    } else {
      console.log(`${prefix} ${entry.event}: ${entry.message}`)
    }

    // 2) SQLite (persistent)
    try {
      db.prepare(`
        INSERT INTO execution_logs (campaign_id, job_id, instance_id, node_id, level, event, message, data_json, created_at)
        VALUES (@campaign_id, @job_id, @instance_id, @node_id, @level, @event, @message, @data_json, @created_at)
      `).run({
        campaign_id: entry.campaign_id,
        job_id: entry.job_id || null,
        instance_id: entry.instance_id || null,
        node_id: entry.node_id || null,
        level: entry.level,
        event: entry.event,
        message: entry.message,
        data_json: entry.data ? JSON.stringify(entry.data) : null,
        created_at: timestamp
      })
    } catch (err) {
      console.error('[ExecutionLogger] Failed to write to DB:', err)
    }

    // 3) IPC ↁErenderer
    this.emitToUI('execution:log', {
      ...entry,
      data_json: entry.data ? JSON.stringify(entry.data) : null,
      created_at: timestamp
    })
  }

  // ── Convenience methods ──

  static nodeStart(campaignId: string, jobId: string, instanceId: string, nodeId: string, inputSummary?: any) {
    this.log({
      campaign_id: campaignId, job_id: jobId, instance_id: instanceId, node_id: nodeId,
      level: 'info', event: 'node:start',
      message: `Node ${instanceId} started`,
      data: { inputSummary }
    })
    this.emitToUI('node:status', {
      campaignId, instanceId, nodeId, status: 'running', jobId
    })
  }

  static nodeEnd(campaignId: string, jobId: string, instanceId: string, nodeId: string, resultSummary: any, durationMs: number) {
    this.log({
      campaign_id: campaignId, job_id: jobId, instance_id: instanceId, node_id: nodeId,
      level: 'info', event: 'node:end',
      message: `Node ${instanceId} completed in ${durationMs}ms`,
      data: { resultSummary, durationMs }
    })
    this.emitToUI('node:status', {
      campaignId, instanceId, nodeId, status: 'completed', jobId, resultSummary
    })
  }

  /** Emit structured node result data for live detail views */
  static nodeData(campaignId: string, instanceId: string, nodeId: string, data: any) {
    this.emitToUI('execution:node-data', {
      campaignId, instanceId, nodeId, data, timestamp: Date.now()
    })
  }

  static nodeError(campaignId: string, jobId: string, instanceId: string, nodeId: string, error: string) {
    this.log({
      campaign_id: campaignId, job_id: jobId, instance_id: instanceId, node_id: nodeId,
      level: 'error', event: 'node:error',
      message: error
    })
    this.emitToUI('node:status', {
      campaignId, instanceId, nodeId, status: 'failed', jobId, error
    })
    // Push error toast to UI
    this.sendToast('error', `❁E${instanceId}`, error)
  }

  /** Push a toast notification to the renderer UI */
  static sendToast(type: 'info' | 'success' | 'warning' | 'error', message: string, description?: string) {
    this.emitToRenderer('app:toast', { type, message, description })
  }

  static nodeProgress(campaignId: string, jobId: string, instanceId: string, nodeId: string, message: string) {
    this.log({
      campaign_id: campaignId, job_id: jobId, instance_id: instanceId, node_id: nodeId,
      level: 'progress', event: 'node:progress',
      message
    })
    this.emitToUI('node:progress', {
      campaignId, instanceId, nodeId, message, jobId
    })
  }

  static campaignEvent(campaignId: string, event: string, message: string, data?: any) {
    this.log({
      campaign_id: campaignId,
      level: 'info', event,
      message, data
    })
    const payload = { campaignId, ...data }
    this.emitToUI(event, payload)
    _bus.emit(event, payload)
  }

  /** Emit a structured node event (captcha, violation, video:active, etc.) */
  static emitNodeEvent(campaignId: string, instanceId: string, event: string, data?: any) {
    const payload = { campaignId, instanceId, event, data, timestamp: Date.now() }
    this.emitToUI('node:event', payload)
    _bus.emit('node:event', payload)
    this.log({
      campaign_id: campaignId, instance_id: instanceId,
      level: 'info', event: `node:event:${event}`,
      message: event, data
    })
  }

  /** Subscribe to internal main-process events (for workflow events.ts modules) */
  static on(event: string, handler: (...args: any[]) => void) {
    _bus.on(event, handler)
  }

  static off(event: string, handler: (...args: any[]) => void) {
    _bus.off(event, handler)
  }

  /** Get logs from DB for a campaign */
  static getLogsForCampaign(campaignId: string, limit: number = 200): any[] {
    return db.prepare(
      'SELECT * FROM execution_logs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(campaignId, limit) as any[]
  }
}

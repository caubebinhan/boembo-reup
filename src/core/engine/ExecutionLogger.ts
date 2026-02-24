import { db } from '../../main/db/Database'
import { BrowserWindow } from 'electron'

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
export class ExecutionLogger {
  private static emitToUI(event: string, payload: any) {
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send(event, payload)
        }
      })
    } catch (_) { /* window may not exist */ }
  }

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

    // 3) IPC → renderer
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

  static nodeError(campaignId: string, jobId: string, instanceId: string, nodeId: string, error: string) {
    this.log({
      campaign_id: campaignId, job_id: jobId, instance_id: instanceId, node_id: nodeId,
      level: 'error', event: 'node:error',
      message: error
    })
    this.emitToUI('node:status', {
      campaignId, instanceId, nodeId, status: 'failed', jobId, error
    })
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
    this.emitToUI(event, { campaignId, ...data })
  }

  /** Get logs from DB for a campaign */
  static getLogsForCampaign(campaignId: string, limit: number = 200): any[] {
    return db.prepare(
      'SELECT * FROM execution_logs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(campaignId, limit) as any[]
  }
}

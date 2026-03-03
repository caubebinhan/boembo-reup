import { net } from 'electron'
import { flowLoader } from '../../core/flow/FlowLoader'
import { campaignRepo } from '../db/repositories/CampaignRepo'
import { ExecutionLogger } from '../../core/engine/ExecutionLogger'
import { flowEngine } from '../../core/engine/FlowEngine'

/**
 * ServiceHealthMonitor — Background service that periodically pings
 * workflow-declared service endpoints and auto-pauses affected campaigns
 * when a service becomes unreachable.
 *
 * Usage:
 *   serviceHealthMonitor.start()   // call after flowEngine.start()
 *   serviceHealthMonitor.stop()    // on app quit
 */

interface ServiceStatus {
  name: string
  url: string
  workflowIds: string[]
  ok: boolean
  lastCheckMs: number
  consecutiveFailures: number
  error?: string
}

const PING_INTERVAL_MS = 60_000         // check every 60s
const FAILURE_THRESHOLD = 2             // pause after 2 consecutive failures

class ServiceHealthMonitor {
  private intervalId: NodeJS.Timeout | null = null
  private readonly services = new Map<string, ServiceStatus>()
  private isRunning = false

  /** Start periodic health checks */
  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.rebuildServiceMap()
    this.intervalId = setInterval(() => this.tick(), PING_INTERVAL_MS)
    // Initial check after 10s (give app time to settle)
    setTimeout(() => this.tick(), 10000)
    console.log('[ServiceHealthMonitor] Started — checking every', PING_INTERVAL_MS / 1000, 's')
  }

  stop() {
    this.isRunning = false
    if (this.intervalId) clearInterval(this.intervalId)
    this.intervalId = null
    console.log('[ServiceHealthMonitor] Stopped')
  }

  /** Rebuild the service→workflow mapping from loaded flows */
  rebuildServiceMap() {
    const flows = flowLoader.getAll()
    this.services.clear()

    for (const flow of flows) {
      if (!flow.health_checks?.length) continue
      for (const hc of flow.health_checks) {
        const existing = this.services.get(hc.url)
        if (existing) {
          if (!existing.workflowIds.includes(flow.id)) existing.workflowIds.push(flow.id)
        } else {
          this.services.set(hc.url, {
            name: hc.name,
            url: hc.url,
            workflowIds: [flow.id],
            ok: true,
            lastCheckMs: 0,
            consecutiveFailures: 0,
          })
        }
      }
    }
  }

  /** Ping all services */
  private async tick() {
    if (!this.isRunning) return

    for (const [url, svc] of this.services) {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        await net.fetch(url, { method: 'HEAD', signal: controller.signal as any })
        clearTimeout(timeout)

        // Service recovered
        if (!svc.ok && svc.consecutiveFailures >= FAILURE_THRESHOLD) {
          console.log(`[ServiceHealthMonitor] ✅ ${svc.name} recovered after ${svc.consecutiveFailures} failures`)
          // Don't auto-resume — user should manually resume campaigns
          this.emitServiceEvent(svc, 'service:recovered', `${svc.name} is reachable again`)
        }

        svc.ok = true
        svc.consecutiveFailures = 0
        svc.error = undefined
        svc.lastCheckMs = Date.now() - start
      } catch (err: any) {
        svc.ok = false
        svc.consecutiveFailures++
        svc.error = err?.message || 'Unreachable'
        svc.lastCheckMs = Date.now() - start

        console.log(`[ServiceHealthMonitor] ❌ ${svc.name} failed (${svc.consecutiveFailures}x): ${svc.error}`)

        if (svc.consecutiveFailures === FAILURE_THRESHOLD) {
          this.pauseAffectedCampaigns(svc)
        }
      }
    }
  }

  /** Pause all running campaigns that use affected workflows */
  private pauseAffectedCampaigns(svc: ServiceStatus) {
    const allCampaigns = campaignRepo.findAll()

    for (const campaign of allCampaigns) {
      if (!['active', 'running'].includes(campaign.status)) continue
      if (!svc.workflowIds.includes(campaign.workflow_id)) continue

      console.log(`[ServiceHealthMonitor] Pausing campaign "${campaign.name}" — ${svc.name} unreachable`)

      flowEngine.pauseCampaign(campaign.id)

      // Emit alert so the UI shows what happened
      ExecutionLogger.campaignEvent(campaign.id, 'campaign:service-outage',
        `⚠️ Auto-paused: ${svc.name} unreachable (${svc.error}). Please check your network and resume manually.`)

      this.emitServiceEvent(svc, 'service:outage', `${svc.name} unreachable — campaign "${campaign.name}" paused`, campaign.id)
    }
  }

  /** Emit events to renderer */
  private emitServiceEvent(svc: ServiceStatus, event: string, message: string, campaignId?: string) {
    ExecutionLogger.emitToRenderer('service:health', {
      event,
      service: svc.name,
      url: svc.url,
      ok: svc.ok,
      consecutiveFailures: svc.consecutiveFailures,
      error: svc.error,
      message,
      campaignId,
      timestamp: Date.now(),
    })
  }

  /** Get current status of all services (for splash screen / settings) */
  getStatus(): ServiceStatus[] {
    return Array.from(this.services.values())
  }

  /** Force an immediate recheck (e.g. called from retry button) */
  async forceRecheck(): Promise<ServiceStatus[]> {
    await this.tick()
    return this.getStatus()
  }
}

export const serviceHealthMonitor = new ServiceHealthMonitor()

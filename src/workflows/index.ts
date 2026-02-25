/**
 * Workflow Auto-Discovery
 * ───────────────────────
 * Scans src/workflows/* and auto-loads all optional modules:
 *
 *   recovery.ts  → CrashRecoveryService.registerRecovery(workflowId, module)
 *   ipc.ts       → calls module.setup() for per-workflow IPC handlers
 *   services.ts  → calls module.setup() for per-workflow services (e.g. PublishAccountService)
 *   events.ts    → calls module.setup() for per-workflow EventBus listeners
 *
 * Workflow ID = folder name (e.g. tiktok-repost, upload-local).
 * To add a new workflow: create a folder, drop any of the above files. No manual imports needed.
 */
import { CrashRecoveryService } from '../main/services/CrashRecovery'

type SetupModule = { setup?: () => void }
type RecoveryModule = { recover?: (campaignId: string) => void }

// ── Recovery modules ────────────────────────────────────
const recoveryModules = import.meta.glob('./*/recovery.ts', { eager: true })
let recoveryCount = 0
for (const [path, mod] of Object.entries(recoveryModules)) {
  const wfId = path.match(/^\.\/([^/]+)\//)?.[1]
  if (!wfId) continue
  const m = mod as RecoveryModule
  if (typeof m.recover === 'function') {
    CrashRecoveryService.registerRecovery(wfId, { recover: m.recover })
    recoveryCount++
  }
}
console.log(`[Workflows] Auto-discovered ${recoveryCount} recovery modules`)

// ── IPC modules ─────────────────────────────────────────
const ipcModules = import.meta.glob('./*/ipc.ts', { eager: true })
let ipcCount = 0
for (const [path, mod] of Object.entries(ipcModules)) {
  const wfId = path.match(/^\.\/([^/]+)\//)?.[1]
  if (!wfId) continue
  const m = mod as SetupModule
  if (typeof m.setup === 'function') { m.setup(); ipcCount++ }
}
console.log(`[Workflows] Auto-discovered ${ipcCount} workflow IPC modules`)

// ── Service modules ─────────────────────────────────────
const serviceModules = import.meta.glob('./*/services.ts', { eager: true })
let svcCount = 0
for (const [path, mod] of Object.entries(serviceModules)) {
  const wfId = path.match(/^\.\/([^/]+)\//)?.[1]
  if (!wfId) continue
  const m = mod as SetupModule
  if (typeof m.setup === 'function') { m.setup(); svcCount++ }
}
console.log(`[Workflows] Auto-discovered ${svcCount} workflow service modules`)

// ── Event modules ───────────────────────────────────────
const eventModules = import.meta.glob('./*/events.ts', { eager: true })
let evtCount = 0
for (const [path, mod] of Object.entries(eventModules)) {
  const wfId = path.match(/^\.\/([^/]+)\//)?.[1]
  if (!wfId) continue
  const m = mod as SetupModule
  if (typeof m.setup === 'function') { m.setup(); evtCount++ }
}
console.log(`[Workflows] Auto-discovered ${evtCount} workflow event modules`)

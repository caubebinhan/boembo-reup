/**
 * Workflow Auto-Discovery (Versioned)
 * ────────────────────────────────────
 * Scans src/workflows/[id]/v[x.y]/* and auto-loads all optional modules:
 *
 *   recovery.ts  → CrashRecoveryService.registerRecovery(workflowId, module)
 *   ipc.ts       → calls module.setup() for per-workflow IPC handlers
 *   services.ts  → calls module.setup() for per-workflow services
 *   events.ts    → calls module.setup() for per-workflow EventBus listeners
 *
 * Workflow ID = folder name (e.g. tiktok-repost, upload-local).
 * Version = subfolder (e.g. v1.0, v2.0).
 * All versions are loaded so campaigns on different versions coexist.
 */
import { CrashRecoveryService } from '../main/services/CrashRecovery'
import { lifecycleRegistry, type WorkflowLifecycle } from '../core/flow/WorkflowLifecycle'

type SetupModule = { setup?: () => void }
type RecoveryModule = { recover?: (campaignId: string) => void }
type LifecycleModule = { default?: WorkflowLifecycle }

// Extract workflowId from path like ./tiktok-repost/v1.0/events.ts
function extractWorkflowId(p: string): string | null {
  return p.match(/^\.\/([^/]+)\//)?.[1] || null
}

// Extract version from path like ./tiktok-repost/v1.0/events.ts
function extractVersion(p: string): string | null {
  return p.match(/\/(v[\d.]+)\//)?.[1] || null
}

// ── Recovery modules ────────────────────────────────────
const recoveryModules = import.meta.glob('./*/v*/recovery.ts', { eager: true })
let recoveryCount = 0
for (const [path, mod] of Object.entries(recoveryModules)) {
  const wfId = extractWorkflowId(path)
  const ver = extractVersion(path)
  if (!wfId) continue
  const m = mod as RecoveryModule
  if (typeof m.recover === 'function') {
    // Register with version-aware key so v2 doesn't silently overwrite v1
    const key = ver ? `${wfId}@${ver}` : wfId
    CrashRecoveryService.registerRecovery(key, { recover: m.recover })
    recoveryCount++
  }
}
console.log(`[Workflows] Auto-discovered ${recoveryCount} recovery modules`)

// ── IPC modules ─────────────────────────────────────────
const ipcModules = import.meta.glob('./*/v*/ipc.ts', { eager: true })
let ipcCount = 0
for (const [path, mod] of Object.entries(ipcModules)) {
  const wfId = extractWorkflowId(path)
  if (!wfId) continue
  const m = mod as SetupModule
  if (typeof m.setup === 'function') { m.setup(); ipcCount++ }
}
console.log(`[Workflows] Auto-discovered ${ipcCount} workflow IPC modules`)

// ── Service modules ─────────────────────────────────────
const serviceModules = import.meta.glob('./*/v*/services.ts', { eager: true })
let svcCount = 0
for (const [path, mod] of Object.entries(serviceModules)) {
  const wfId = extractWorkflowId(path)
  if (!wfId) continue
  const m = mod as SetupModule
  if (typeof m.setup === 'function') { m.setup(); svcCount++ }
}
console.log(`[Workflows] Auto-discovered ${svcCount} workflow service modules`)

// ── Event modules ───────────────────────────────────────
const eventModules = import.meta.glob('./*/v*/events.ts', { eager: true })
let evtCount = 0
for (const [path, mod] of Object.entries(eventModules)) {
  const wfId = extractWorkflowId(path)
  if (!wfId) continue
  const m = mod as SetupModule
  if (typeof m.setup === 'function') { m.setup(); evtCount++ }
}
console.log(`[Workflows] Auto-discovered ${evtCount} workflow event modules`)

// ── Lifecycle modules ───────────────────────────────────
const lifecycleModules = import.meta.glob('./*/v*/lifecycle.ts', { eager: true })
let lcCount = 0
for (const [path, mod] of Object.entries(lifecycleModules)) {
  const wfId = extractWorkflowId(path)
  if (!wfId) continue
  const m = mod as LifecycleModule
  if (m.default) {
    lifecycleRegistry.register(wfId, m.default)
    lcCount++
  }
}
console.log(`[Workflows] Auto-discovered ${lcCount} workflow lifecycle modules`)


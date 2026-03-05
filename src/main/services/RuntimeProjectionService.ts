/**
 * RuntimeProjectionService
 * ─────────────────────────────────────────────────────
 * Global singleton — started at main process boot.
 *
 * Subscribes to `execution:trace` from ExecutionLogger (Trace Bus)
 * and projects runtime state onto campaign documents as `meta.runtime`.
 *
 * UI reads `campaign.meta.runtime` instead of guessing from scattered
 * log events. Provides a single source-of-truth for:
 *   - currentNode: which node is currently executing
 *   - lastProgress: last onProgress message
 *   - pauseCheckpoint: where the campaign was paused (and why)
 *   - state: current lifecycle state
 *
 * Also exposes getRuntimeState(campaignId) for IPC handlers.
 */
import { ExecutionLogger } from '@core/engine/ExecutionLogger'
import { campaignRepo } from '@main/db/repositories/CampaignRepo'
import type { TraceEntry, PauseCheckpoint } from '@core/flow/ExecutionContracts'

export interface RuntimeState {
  state: 'idle' | 'running' | 'paused' | 'finished' | 'error'
  currentNode?: string
  currentNodeId?: string
  lastProgress?: string
  lastCompletedNode?: string
  loopIndex?: number
  loopTotal?: number
  pauseCheckpoint?: PauseCheckpoint
  updatedAt: number
}

/**
 * In-memory cache of runtime state per campaign.
 * Written to campaign doc on state transitions (pause/finish/error),
 * NOT on every progress update (to avoid I/O thrash).
 */
const _cache = new Map<string, RuntimeState>()

function ensureState(campaignId: string): RuntimeState {
  let s = _cache.get(campaignId)
  if (!s) {
    s = { state: 'idle', updatedAt: Date.now() }
    _cache.set(campaignId, s)
  }
  return s
}

/** Persist runtime state to campaign doc.meta.runtime */
function persist(campaignId: string, state: RuntimeState) {
  try {
    const store = campaignRepo.tryOpen(campaignId)
    if (!store) return
    const doc = store.doc as any
    if (!doc.meta) doc.meta = {}
    doc.meta.runtime = state
    // Lazy migrate old _pauseCheckpoint to meta.runtime.pauseCheckpoint
    if (doc._pauseCheckpoint) {
      if (!state.pauseCheckpoint) {
        state.pauseCheckpoint = doc._pauseCheckpoint
      }
      delete doc._pauseCheckpoint
    }
    store.save()
  } catch (err) {
    console.error('[RuntimeProjection] Failed to persist:', err)
  }
}

function onTrace(trace: TraceEntry) {
  const { campaignId, event, instanceId, nodeId, message } = trace
  if (!campaignId) return

  const s = ensureState(campaignId)

  switch (event) {
    // ── Node lifecycle ──
    case 'node:start':
      s.state = 'running'
      s.currentNode = instanceId
      s.currentNodeId = nodeId
      s.updatedAt = trace.timestamp
      break

    case 'node:end':
      s.lastCompletedNode = instanceId
      s.updatedAt = trace.timestamp
      break

    case 'node:progress':
      s.lastProgress = message
      s.updatedAt = trace.timestamp
      break

    // ── Loop tracking ──
    case 'loop:start': {
      const match = message.match(/(\d+) items/)
      if (match) s.loopTotal = parseInt(match[1])
      s.updatedAt = trace.timestamp
      break
    }
    case 'loop:iteration': {
      const match = message.match(/Item (\d+)\/(\d+)/)
      if (match) {
        s.loopIndex = parseInt(match[1]) - 1 // 0-based
        s.loopTotal = parseInt(match[2])
      }
      s.updatedAt = trace.timestamp
      break
    }

    // ── Campaign state transitions (persist to disk) ──
    case 'campaign:paused':
      s.state = 'paused'
      s.updatedAt = trace.timestamp
      // pauseCheckpoint is set separately by FlowEngine writing meta.runtime
      persist(campaignId, s)
      break

    case 'campaign:resumed':
      s.state = 'running'
      s.pauseCheckpoint = undefined
      s.lastProgress = undefined
      s.currentNode = undefined
      s.updatedAt = trace.timestamp
      persist(campaignId, s)
      break

    case 'campaign:finished':
      s.state = 'finished'
      s.currentNode = undefined
      s.updatedAt = trace.timestamp
      persist(campaignId, s)
      break

    case 'campaign:error':
      s.state = 'error'
      s.updatedAt = trace.timestamp
      persist(campaignId, s)
      break

    case 'campaign:healthcheck-failed':
      // Don't change state — the campaign hasn't started
      break
  }
}

export const runtimeProjectionService = {
  start() {
    ExecutionLogger.on('execution:trace', onTrace)
    console.log('[RuntimeProjection] Service started — listening to execution:trace')
  },

  stop() {
    ExecutionLogger.off('execution:trace', onTrace)
    _cache.clear()
  },

  /**
   * Get runtime state for a campaign.
   * Returns in-memory cache if available, else lazy-loads from campaign doc.
   */
  getRuntimeState(campaignId: string): RuntimeState | null {
    // Check in-memory cache first
    let state = _cache.get(campaignId)
    if (state) return state

    // Lazy load from campaign doc
    try {
      const store = campaignRepo.tryOpen(campaignId)
      if (!store) return null
      const doc = store.doc as any

      // Lazy migrate _pauseCheckpoint
      if (doc._pauseCheckpoint && !doc.meta?.runtime?.pauseCheckpoint) {
        if (!doc.meta) doc.meta = {}
        if (!doc.meta.runtime) doc.meta.runtime = { state: 'idle', updatedAt: Date.now() }
        doc.meta.runtime.pauseCheckpoint = doc._pauseCheckpoint
        delete doc._pauseCheckpoint
        store.save()
      }

      if (doc.meta?.runtime) {
        _cache.set(campaignId, doc.meta.runtime)
        return doc.meta.runtime
      }
    } catch { /* best effort */ }

    return null
  },

  /**
   * Merge a pause checkpoint into the runtime state and persist.
   * Called by FlowEngine when a pause occurs.
   */
  setPauseCheckpoint(campaignId: string, checkpoint: PauseCheckpoint) {
    const s = ensureState(campaignId)
    s.state = 'paused'
    s.pauseCheckpoint = checkpoint
    s.updatedAt = Date.now()
    persist(campaignId, s)
  },

  /** Clear runtime cache for a campaign (e.g. on delete) */
  clear(campaignId: string) {
    _cache.delete(campaignId)
  },
}

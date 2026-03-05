/**
 * ConcurrencyLock — in-memory concurrency guards for FlowEngine.
 *
 * Provides two singleton locks:
 *
 * 1. **EntityLock** — per-entity guard. Ensures only ONE pipeline step
 *    can process a given entity (video, post, order, etc.) at any time.
 *    Prevents race conditions from manual retry + loop overlap.
 *
 * 2. **CampaignPipelineLock** — per-campaign guard. Ensures only ONE
 *    pipeline job runs for a given campaign at any time. Prevents
 *    double-trigger from rapid pause/resume/retry.
 *
 * Pattern: in-memory Map (no DB overhead). Safe because FlowEngine is a
 * singleton within the main Electron process.
 *
 * All locks include a configurable stale-lock timeout as a safety net
 * against leaked locks from uncaught errors or process hangs.
 *
 * @future When scaling to multi-worker, migrate to DB/queue lease
 *         (claimed_by, lease_until, CAS claim) per entity_key.
 */

interface LockEntry {
  instanceId: string   // e.g. 'publisher_1'
  jobId: string
  campaignId: string
  acquiredAt: number
}

const STALE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

class EntityLockImpl {
  private locks = new Map<string, LockEntry>()

  /**
   * Try to acquire the lock for an entity.
   * Returns `true` if acquired (or already held by same job).
   * Returns `false` if another job/node already holds the lock.
   */
  acquire(entityKey: string, instanceId: string, jobId: string, campaignId: string): boolean {
    const existing = this.locks.get(entityKey)

    if (existing) {
      // Same job re-acquiring (idempotent)
      if (existing.jobId === jobId) return true

      // Stale lock? Auto-release
      if (Date.now() - existing.acquiredAt > STALE_TIMEOUT_MS) {
        console.warn(
          `[EntityLock] Stale lock released for ${entityKey} ` +
          `(held by ${existing.instanceId}/${existing.jobId} for ${Math.round((Date.now() - existing.acquiredAt) / 1000)}s)`
        )
        this.locks.delete(entityKey)
        // Fall through to acquire
      } else {
        // Lock is active and held by a different job
        return false
      }
    }

    this.locks.set(entityKey, { instanceId, jobId, campaignId, acquiredAt: Date.now() })
    return true
  }

  /**
   * Release the lock for an entity — only if held by the specified job.
   * Prevents accidental release by a different job.
   */
  release(entityKey: string, jobId: string): void {
    const existing = this.locks.get(entityKey)
    if (existing && existing.jobId === jobId) {
      this.locks.delete(entityKey)
    }
  }

  /**
   * Check if an entity is currently locked.
   * Returns the lock entry if locked (and not stale), or null.
   */
  isLocked(entityKey: string): LockEntry | null {
    const existing = this.locks.get(entityKey)
    if (!existing) return null

    // Auto-cleanup stale locks on query
    if (Date.now() - existing.acquiredAt > STALE_TIMEOUT_MS) {
      this.locks.delete(entityKey)
      return null
    }

    return existing
  }

  /**
   * Force-release an entity lock regardless of holder.
   * Used during crash recovery or campaign cleanup.
   */
  forceRelease(entityKey: string): void {
    this.locks.delete(entityKey)
  }

  /**
   * Release all locks for a given campaign.
   * Called when a campaign is paused/stopped/finished.
   */
  releaseAllForCampaign(campaignId: string): void {
    for (const [key, entry] of this.locks) {
      if (entry.campaignId === campaignId) {
        this.locks.delete(key)
      }
    }
  }

  /** Debug: get current lock count */
  get size(): number {
    return this.locks.size
  }
}

/** Singleton instance */
export const EntityLock = new EntityLockImpl()


// ══════════════════════════════════════════════════════════════════════
// CampaignPipelineLock — per-campaign execution guard (group-aware)
// ══════════════════════════════════════════════════════════════════════

interface PipelineLockEntry {
  jobId: string
  parallelGroup?: string  // if set, other jobs in same group can co-execute
  acquiredAt: number
}

class CampaignPipelineLockImpl {
  // Key: campaignId → Set of active lock entries
  private running = new Map<string, PipelineLockEntry[]>()

  /**
   * Try to acquire the pipeline lock for a campaign.
   *
   * Concurrency rules:
   * - Non-grouped jobs: only 1 can run per campaign (exclusive)
   * - Grouped jobs (parallelGroup set): multiple jobs in the SAME group can co-execute
   * - A grouped job blocks unrelated non-grouped jobs and vice versa
   */
  acquire(campaignId: string, jobId: string, parallelGroup?: string): boolean {
    const entries = this.running.get(campaignId) || []

    // Already held by this job (idempotent)
    if (entries.some(e => e.jobId === jobId)) return true

    // Clean stale entries
    const now = Date.now()
    const STALE_MS = 30 * 60 * 1000
    const active = entries.filter(e => {
      if (now - e.acquiredAt > STALE_MS) {
        console.warn(`[CampaignPipelineLock] Stale lock released for campaign ${campaignId} (job ${e.jobId})`)
        return false
      }
      return true
    })

    if (active.length > 0) {
      if (parallelGroup) {
        // Grouped job: allow if all active entries are in the same group
        const allSameGroup = active.every(e => e.parallelGroup === parallelGroup)
        if (!allSameGroup) return false
      } else {
        // Non-grouped job: blocked by any active entry
        return false
      }
    }

    active.push({ jobId, parallelGroup, acquiredAt: now })
    this.running.set(campaignId, active)
    return true
  }

  /** Release the lock — only removes the entry for the specified job. */
  release(campaignId: string, jobId: string): void {
    const entries = this.running.get(campaignId)
    if (!entries) return
    const remaining = entries.filter(e => e.jobId !== jobId)
    if (remaining.length === 0) {
      this.running.delete(campaignId)
    } else {
      this.running.set(campaignId, remaining)
    }
  }

  /** Check if a campaign pipeline is currently running. */
  isLocked(campaignId: string): boolean {
    const entries = this.running.get(campaignId)
    if (!entries || entries.length === 0) return false
    // Clean stale
    const now = Date.now()
    const active = entries.filter(e => now - e.acquiredAt <= 30 * 60 * 1000)
    if (active.length === 0) {
      this.running.delete(campaignId)
      return false
    }
    this.running.set(campaignId, active)
    return true
  }

  /** Force-release all locks for a campaign (crash recovery). */
  forceRelease(campaignId: string): void {
    this.running.delete(campaignId)
  }
}

export const CampaignPipelineLock = new CampaignPipelineLockImpl()

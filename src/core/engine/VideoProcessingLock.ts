/**
 * VideoProcessingLock — per-video singleton guard.
 *
 * Ensures only ONE pipeline step can be actively processing a given video
 * at any time across the entire FlowEngine. This prevents race conditions
 * where a manual retry creates a publisher job while the loop is still
 * running a downloader for the same video.
 *
 * Pattern: in-memory Map (no DB overhead). Safe because FlowEngine is a
 * singleton within the main Electron process.
 *
 * Includes a configurable stale-lock timeout (default 10min) as a safety
 * net against leaked locks from uncaught errors or process hangs.
 */

interface LockEntry {
  instanceId: string   // e.g. 'publisher_1'
  jobId: string
  campaignId: string
  acquiredAt: number
}

const STALE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

class VideoProcessingLockImpl {
  private locks = new Map<string, LockEntry>()

  /**
   * Try to acquire the lock for a video.
   * Returns `true` if acquired (or already held by same job).
   * Returns `false` if another job/node already holds the lock.
   */
  acquire(videoId: string, instanceId: string, jobId: string, campaignId: string): boolean {
    const existing = this.locks.get(videoId)

    if (existing) {
      // Same job re-acquiring (idempotent)
      if (existing.jobId === jobId) return true

      // Stale lock? Auto-release
      if (Date.now() - existing.acquiredAt > STALE_TIMEOUT_MS) {
        console.warn(
          `[VideoProcessingLock] Stale lock released for video ${videoId} ` +
          `(held by ${existing.instanceId}/${existing.jobId} for ${Math.round((Date.now() - existing.acquiredAt) / 1000)}s)`
        )
        this.locks.delete(videoId)
        // Fall through to acquire
      } else {
        // Lock is active and held by a different job
        return false
      }
    }

    this.locks.set(videoId, { instanceId, jobId, campaignId, acquiredAt: Date.now() })
    return true
  }

  /**
   * Release the lock for a video — only if held by the specified job.
   * Prevents accidental release by a different job.
   */
  release(videoId: string, jobId: string): void {
    const existing = this.locks.get(videoId)
    if (existing && existing.jobId === jobId) {
      this.locks.delete(videoId)
    }
  }

  /**
   * Check if a video is currently locked.
   * Returns the lock entry if locked (and not stale), or null.
   */
  isLocked(videoId: string): LockEntry | null {
    const existing = this.locks.get(videoId)
    if (!existing) return null

    // Auto-cleanup stale locks on query
    if (Date.now() - existing.acquiredAt > STALE_TIMEOUT_MS) {
      this.locks.delete(videoId)
      return null
    }

    return existing
  }

  /**
   * Force-release a video lock regardless of holder.
   * Used during crash recovery or campaign cleanup.
   */
  forceRelease(videoId: string): void {
    this.locks.delete(videoId)
  }

  /**
   * Release all locks for a given campaign.
   * Called when a campaign is paused/stopped/finished.
   */
  releaseAllForCampaign(campaignId: string): void {
    for (const [videoId, entry] of this.locks) {
      if (entry.campaignId === campaignId) {
        this.locks.delete(videoId)
      }
    }
  }

  /** Debug: get current lock count */
  get size(): number {
    return this.locks.size
  }
}

/** Singleton instance */
export const VideoProcessingLock = new VideoProcessingLockImpl()


// ══════════════════════════════════════════════════════════════════════
// CampaignPipelineLock — per-campaign execution guard
// ══════════════════════════════════════════════════════════════════════

/**
 * Ensures only ONE pipeline execution (job) can be actively running
 * for a given campaign at any time. Prevents double-trigger scenarios
 * where `campaign:trigger` is called multiple times in rapid succession.
 *
 * Same pattern as VideoProcessingLock: in-memory, no DB overhead,
 * safe because FlowEngine is a singleton.
 */
class CampaignPipelineLockImpl {
  private running = new Map<string, { jobId: string; acquiredAt: number }>()

  /**
   * Try to acquire the pipeline lock for a campaign.
   * Returns `true` if acquired (or already held by same job).
   * Returns `false` if another job is already executing for this campaign.
   */
  acquire(campaignId: string, jobId: string): boolean {
    const existing = this.running.get(campaignId)
    if (existing) {
      if (existing.jobId === jobId) return true // idempotent
      // Stale lock safety (30 minutes — pipelines shouldn't take this long per job)
      if (Date.now() - existing.acquiredAt > 30 * 60 * 1000) {
        console.warn(`[CampaignPipelineLock] Stale lock released for campaign ${campaignId} (held by job ${existing.jobId})`)
        this.running.delete(campaignId)
      } else {
        return false
      }
    }
    this.running.set(campaignId, { jobId, acquiredAt: Date.now() })
    return true
  }

  /** Release the lock — only if held by the specified job. */
  release(campaignId: string, jobId: string): void {
    const existing = this.running.get(campaignId)
    if (existing && existing.jobId === jobId) {
      this.running.delete(campaignId)
    }
  }

  /** Check if a campaign pipeline is currently running. */
  isLocked(campaignId: string): boolean {
    const existing = this.running.get(campaignId)
    if (!existing) return false
    if (Date.now() - existing.acquiredAt > 30 * 60 * 1000) {
      this.running.delete(campaignId)
      return false
    }
    return true
  }

  /** Force-release (crash recovery). */
  forceRelease(campaignId: string): void {
    this.running.delete(campaignId)
  }
}

export const CampaignPipelineLock = new CampaignPipelineLockImpl()

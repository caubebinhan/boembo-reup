import { db } from '../Database'
import { BaseRepo } from './BaseRepo'
import type { PublishHistoryDocument } from '../models/PublishHistory'

/**
 * Publish History Repository — cross-account dedup.
 *
 * Index columns (account_id, source_platform_id, file_fingerprint, status)
 * are the single source of truth — NOT duplicated in data_json.
 */
export class PublishHistoryRepository extends BaseRepo<PublishHistoryDocument> {
  constructor() {
    super('publish_history')
  }

  protected override indexedColumnMap(): Record<string, string> {
    return {
      account_id: 'account_id',
      source_platform_id: 'source_platform_id',
      file_fingerprint: 'file_fingerprint',
      status: 'status',
    }
  }

  // ── Indexed lookups ─────────────────────────

  findByAccountAndSource(accountId: string, platformId: string): PublishHistoryDocument | null {
    const row = db
      .prepare(
        `SELECT data_json, account_id, source_platform_id, file_fingerprint, status
         FROM publish_history
         WHERE account_id = ? AND source_platform_id = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(accountId, platformId) as Record<string, any> | undefined
    if (!row) return null
    return this.mergeIndexedFields(JSON.parse(row.data_json), row)
  }

  findByAccountAndFingerprint(
    accountId: string,
    fingerprint: string
  ): PublishHistoryDocument | null {
    const row = db
      .prepare(
        `SELECT data_json, account_id, source_platform_id, file_fingerprint, status
         FROM publish_history
         WHERE account_id = ? AND file_fingerprint = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(accountId, fingerprint) as Record<string, any> | undefined
    if (!row) return null
    return this.mergeIndexedFields(JSON.parse(row.data_json), row)
  }

  findByAccount(accountId: string, limit = 200): PublishHistoryDocument[] {
    const rows = db
      .prepare(
        `SELECT data_json, account_id, source_platform_id, file_fingerprint, status
         FROM publish_history WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?`
      )
      .all(accountId, limit) as Record<string, any>[]
    return rows.map((r) => this.mergeIndexedFields(JSON.parse(r.data_json), r))
  }

  // ── Combined dedup lookup (OR match on source_platform_id OR file_fingerprint) ──
  // NOTE: 'uploading' records older than 30 min are ignored — they are stale
  // crash artifacts, not active uploads (see CrashRecovery).
  findExactDuplicate(
    accountId: string,
    sourcePlatformId?: string,
    fileFingerprint?: string
  ): PublishHistoryDocument | null {
    const clauses: string[] = []
    const params: any[] = []
    if (sourcePlatformId) {
      clauses.push('source_platform_id = ?')
      params.push(sourcePlatformId)
    }
    if (fileFingerprint) {
      clauses.push('file_fingerprint = ?')
      params.push(fileFingerprint)
    }
    if (clauses.length === 0) return null

    const staleThresholdMs = 30 * 60 * 1000 // 30 minutes
    const cutoff = Date.now() - staleThresholdMs

    const row = db
      .prepare(
        `SELECT data_json, account_id, source_platform_id, file_fingerprint, status
         FROM publish_history
         WHERE account_id = ?
           AND (
             (status IN ('under_review', 'published'))
             OR (status = 'uploading' AND updated_at > ?)
           )
           AND (${clauses.join(' OR ')})
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(accountId, cutoff, ...params) as Record<string, any> | undefined
    if (!row) return null
    return this.mergeIndexedFields(JSON.parse(row.data_json), row)
  }

  // ── Candidates for AV similarity matching ──
  findCandidates(accountId: string, limit = 25): PublishHistoryDocument[] {
    const rows = db
      .prepare(
        `SELECT data_json, account_id, source_platform_id, file_fingerprint, status
         FROM publish_history
         WHERE account_id = ?
           AND status IN ('uploading', 'under_review', 'published')
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(accountId, Math.max(1, Math.min(200, limit))) as Record<string, any>[]
    return rows.map((r) => this.mergeIndexedFields(JSON.parse(r.data_json), r))
  }

  // ── Partial update (merge into existing document) ──
  patch(id: string, updates: Partial<PublishHistoryDocument>): void {
    const doc = this.findById(id)
    if (!doc) return
    Object.assign(doc, updates, { updated_at: Date.now() })
    this.save(doc)
  }

  /**
   * Atomically claim a publish slot using INSERT OR IGNORE.
   * If the unique partial index rejects the insert (another active row exists),
   * returns { claimed: false } — preventing race-condition duplicate uploads.
   */
  claimForPublish(payload: {
    id: string
    accountId: string
    sourcePlatformId?: string
    fileFingerprint?: string
    campaignId?: string
    sourceLocalPath?: string
  }): { claimed: boolean; id: string } {
    const now = Date.now()

    // Build data_json WITHOUT indexed fields (they go to columns only)
    const jsonDoc = {
      id: payload.id,
      platform: 'tiktok',
      source_local_path: payload.sourceLocalPath,
      campaign_id: payload.campaignId,
      media_signature: null,
      created_at: now,
      updated_at: now,
    }

    const result = db
      .prepare(
        `INSERT OR IGNORE INTO publish_history
           (id, data_json, account_id, source_platform_id, file_fingerprint, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'uploading', ?, ?)`
      )
      .run(
        payload.id,
        JSON.stringify(jsonDoc),
        payload.accountId,
        payload.sourcePlatformId || null,
        payload.fileFingerprint || null,
        now,
        now,
      )

    return { claimed: result.changes > 0, id: payload.id }
  }

  /** Remove a claim row (e.g. on publish failure, so retries can re-claim) */
  removeClaim(id: string): void {
    db.prepare(
      `DELETE FROM publish_history WHERE id = ? AND status = 'uploading'`
    ).run(id)
  }

  /**
   * Clean up stale 'uploading' claims older than the given threshold.
   * Called during crash recovery to prevent false duplicate detection.
   * Returns the number of rows deleted.
   */
  cleanupStaleUploadingClaims(maxAgeMs = 30 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs
    const result = db.prepare(
      `DELETE FROM publish_history WHERE status = 'uploading' AND updated_at < ?`
    ).run(cutoff)
    return result.changes
  }
}

export const publishHistoryRepo = new PublishHistoryRepository()

import { db } from '../Database'
import { BaseRepo } from './BaseRepo'
import type { PublishHistoryDocument } from '../models/PublishHistory'

/**
 * Publish History Repository — cross-account dedup.
 *
 * Keeps index columns (account_id, source_platform_id, file_fingerprint)
 * for efficient dedup lookups without scanning all documents.
 */
export class PublishHistoryRepository extends BaseRepo<PublishHistoryDocument> {
  constructor() {
    super('publish_history')
  }

  // ── Indexed lookups ─────────────────────────

  findByAccountAndSource(accountId: string, platformId: string): PublishHistoryDocument | null {
    const row = db
      .prepare(
        `SELECT data_json FROM publish_history
         WHERE account_id = ? AND source_platform_id = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(accountId, platformId) as { data_json: string } | undefined
    return row ? JSON.parse(row.data_json) as PublishHistoryDocument : null
  }

  findByAccountAndFingerprint(accountId: string, fingerprint: string): PublishHistoryDocument | null {
    const row = db
      .prepare(
        `SELECT data_json FROM publish_history
         WHERE account_id = ? AND file_fingerprint = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(accountId, fingerprint) as { data_json: string } | undefined
    return row ? JSON.parse(row.data_json) as PublishHistoryDocument : null
  }

  findByAccount(accountId: string, limit = 200): PublishHistoryDocument[] {
    const rows = db
      .prepare(`SELECT data_json FROM publish_history WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?`)
      .all(accountId, limit) as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json) as PublishHistoryDocument)
  }

  // ── Combined dedup lookup (OR match on source_platform_id OR file_fingerprint) ──
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

    const row = db
      .prepare(
        `SELECT data_json FROM publish_history
         WHERE account_id = ?
           AND status IN ('under_review', 'published')
           AND (${clauses.join(' OR ')})
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(accountId, ...params) as { data_json: string } | undefined
    return row ? JSON.parse(row.data_json) as PublishHistoryDocument : null
  }

  // ── Candidates for AV similarity matching ──
  findCandidates(accountId: string, limit = 25): PublishHistoryDocument[] {
    const rows = db
      .prepare(
        `SELECT data_json FROM publish_history
         WHERE account_id = ?
           AND status IN ('under_review', 'published')
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(accountId, Math.max(1, Math.min(200, limit))) as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json) as PublishHistoryDocument)
  }

  // ── Partial update (merge into existing document) ──
  patch(id: string, updates: Partial<PublishHistoryDocument>): void {
    const doc = this.findById(id)
    if (!doc) return
    Object.assign(doc, updates, { updated_at: Date.now() })
    this.save(doc)
  }

  // ── Index columns sync ──────────────────────
  protected override syncIndexColumns(doc: PublishHistoryDocument): void {
    db.prepare(
      `UPDATE publish_history
       SET account_id = ?, source_platform_id = ?, file_fingerprint = ?
       WHERE id = ?`
    ).run(doc.account_id, doc.source_platform_id || null, doc.file_fingerprint || null, doc.id)
  }
}

export const publishHistoryRepo = new PublishHistoryRepository()

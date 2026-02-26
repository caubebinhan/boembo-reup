import { db } from '../Database'

/**
 * Generic document-store repository backed by SQLite.
 *
 * Each "collection" is a SQLite table with:
 *   id TEXT PRIMARY KEY, data_json TEXT, created_at INTEGER, updated_at INTEGER
 *
 * ## Adding custom fields
 *
 * NoSQL = schemaless. Just add an optional field to your interface.
 * Old documents won't have it — use `doc.field ?? defaultValue` in code.
 *
 * For workflow-specific data, use the schemaless areas:
 *   - `CampaignDocument.params` — workflow config
 *   - `VideoRecord.data` — per-video metadata
 *   - `CampaignDocument.meta` — runtime state
 */
export abstract class BaseRepo<T extends { id: string }> {
  constructor(protected readonly table: string) {}

  // ── Read ──────────────────────────────────────

  findById(id: string): T | null {
    const row = db
      .prepare(`SELECT data_json FROM ${this.table} WHERE id = ?`)
      .get(id) as { data_json: string } | undefined
    if (!row) return null
    return JSON.parse(row.data_json) as T
  }

  findAll(): T[] {
    const rows = db
      .prepare(`SELECT data_json FROM ${this.table} ORDER BY created_at DESC`)
      .all() as { data_json: string }[]
    return rows.map(r => JSON.parse(r.data_json) as T)
  }

  exists(id: string): boolean {
    const row = db
      .prepare(`SELECT 1 FROM ${this.table} WHERE id = ? LIMIT 1`)
      .get(id)
    return !!row
  }

  // ── Write ─────────────────────────────────────

  save(doc: T): void {
    const now = Date.now()
    const json = JSON.stringify(doc)
    db.prepare(
      `INSERT OR REPLACE INTO ${this.table} (id, data_json, created_at, updated_at)
       VALUES (?, ?, COALESCE((SELECT created_at FROM ${this.table} WHERE id = ?), ?), ?)`
    ).run(doc.id, json, doc.id, now, now)
    this.syncIndexColumns(doc)
  }

  delete(id: string): void {
    db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id)
  }

  deleteWhere(predicate: (doc: T) => boolean): number {
    const all = this.findAll()
    const toDelete = all.filter(predicate)
    if (toDelete.length === 0) return 0
    const tx = db.transaction(() => {
      for (const doc of toDelete) this.delete(doc.id)
    })
    tx()
    return toDelete.length
  }

  // ── Batch ─────────────────────────────────────

  saveMany(docs: T[]): void {
    const tx = db.transaction(() => {
      for (const doc of docs) this.save(doc)
    })
    tx()
  }

  // ── Index columns (override in subclass) ──────
  /**
   * Sync denormalized index columns alongside data_json.
   * Override in subclasses that need indexed cross-document queries.
   */
  protected syncIndexColumns(_doc: T): void {
    // no-op by default
  }
}

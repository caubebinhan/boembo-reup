import { db } from '../Database'

/**
 * Generic document-store repository backed by SQLite.
 *
 * Each "collection" is a SQLite table with:
 *   id TEXT PRIMARY KEY, data_json TEXT, created_at INTEGER, updated_at INTEGER
 *   + optional index columns for cross-document queries
 *
 * ## Single source of truth
 *
 * Index columns (status, campaign_id, etc.) are the ONLY place those values
 * live. They are stripped from data_json on write and merged back on read.
 * This eliminates drift between data_json and index columns.
 *
 * Subclasses declare indexed fields via `indexedColumnMap()`.
 */
export abstract class BaseRepo<T extends { id: string }> {
  constructor(protected readonly table: string) {}

  // ── Index column mapping (override in subclass) ──
  /**
   * Return a map of { sqlColumn: docFieldPath } for fields that should
   * live ONLY in index columns, NOT in data_json.
   *
   * Example: { status: 'status', campaign_id: 'campaign_id' }
   */
  protected indexedColumnMap(): Record<string, string> {
    return {}
  }

  // ── Internal: strip/merge helpers ──────────────

  /** Strip indexed fields from a doc clone before serializing to data_json */
  private stripIndexedFields(doc: T): { json: string; columns: Record<string, any> } {
    const map = this.indexedColumnMap()
    const entries = Object.entries(map)
    if (entries.length === 0) {
      return { json: JSON.stringify(doc), columns: {} }
    }

    const clone = { ...doc } as Record<string, any>
    const columns: Record<string, any> = {}
    for (const [col, field] of entries) {
      columns[col] = clone[field] ?? null
      delete clone[field]
    }
    return { json: JSON.stringify(clone), columns }
  }

  /** Merge index column values back into a parsed document */
  protected mergeIndexedFields(doc: T, row: Record<string, any>): T {
    const map = this.indexedColumnMap()
    const entries = Object.entries(map)
    if (entries.length === 0) return doc

    const merged = doc as Record<string, any>
    for (const [col, field] of entries) {
      if (row[col] !== undefined && row[col] !== null) {
        merged[field] = row[col]
      }
    }
    return merged as T
  }

  // ── Read ──────────────────────────────────────

  findById(id: string): T | null {
    const map = this.indexedColumnMap()
    const colList = Object.keys(map)
    const selectCols = colList.length > 0
      ? `data_json, ${colList.join(', ')}`
      : 'data_json'

    const row = db
      .prepare(`SELECT ${selectCols} FROM ${this.table} WHERE id = ?`)
      .get(id) as Record<string, any> | undefined
    if (!row) return null
    const doc = JSON.parse(row.data_json) as T
    return this.mergeIndexedFields(doc, row)
  }

  findAll(): T[] {
    const map = this.indexedColumnMap()
    const colList = Object.keys(map)
    const selectCols = colList.length > 0
      ? `data_json, ${colList.join(', ')}`
      : 'data_json'

    const rows = db
      .prepare(`SELECT ${selectCols} FROM ${this.table} ORDER BY created_at DESC`)
      .all() as Record<string, any>[]
    return rows.map(r => {
      const doc = JSON.parse(r.data_json) as T
      return this.mergeIndexedFields(doc, r)
    })
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
    const { json, columns } = this.stripIndexedFields(doc)
    const colEntries = Object.entries(columns)

    if (colEntries.length === 0) {
      // Simple table: no index columns
      db.prepare(
        `INSERT OR REPLACE INTO ${this.table} (id, data_json, created_at, updated_at)
         VALUES (?, ?, COALESCE((SELECT created_at FROM ${this.table} WHERE id = ?), ?), ?)`
      ).run(doc.id, json, doc.id, now, now)
    } else {
      // Table with index columns: single INSERT with all columns
      const colNames = colEntries.map(([col]) => col).join(', ')
      const placeholders = colEntries.map(() => '?').join(', ')
      const colValues = colEntries.map(([, val]) => val)

      db.prepare(
        `INSERT OR REPLACE INTO ${this.table} (id, data_json, ${colNames}, created_at, updated_at)
         VALUES (?, ?, ${placeholders}, COALESCE((SELECT created_at FROM ${this.table} WHERE id = ?), ?), ?)`
      ).run(doc.id, json, ...colValues, doc.id, now, now)
    }
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

  // ── Legacy sync hook (no-op) ──────────────────
  /**
   * @deprecated Index columns are now written atomically in save().
   * Override indexedColumnMap() instead.
   */
  protected syncIndexColumns(_doc: T): void {
    // no-op — exists only for backward compatibility
  }
}

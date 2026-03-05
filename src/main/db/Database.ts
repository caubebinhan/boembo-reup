import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import { join, resolve } from 'node:path'
import { app } from 'electron'

const DB_PATH = process.env.REPOST_IO_DB_PATH
  ? resolve(process.env.REPOST_IO_DB_PATH)
  : join(app.getPath('userData'), 'repost_io.db')

const REQUIRED_TABLES = [
  'campaigns',
  'jobs',
  'execution_logs',
  'publish_accounts',
  'publish_history',
  'app_settings',
  'async_tasks',
]

const REQUIRED_INDEXES = [
  'idx_jobs_pending',
  'idx_jobs_campaign',
  'idx_jobs_campaign_ts',
  'idx_el_campaign',
  'idx_el_campaign_event',
  'idx_ph_account_source',
  'idx_ph_account_fingerprint',
  'idx_ph_account_status',
  'idx_ph_active_source',
  'idx_ph_active_fingerprint',
  'idx_at_due',
  'idx_at_type',
  'idx_at_campaign',
  'idx_at_campaign_ts',
  'idx_at_concurrency',
  'idx_at_owner',
  'idx_at_owner_ts',
  'idx_at_dedupe_active',
]

export const db: BetterSqlite3Database = new Database(DB_PATH)

function createSchema() {
  db.exec(`
    -- Document-store tables: id + data_json
    -- No relational columns except indexed fields for cross-document queries

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      -- Index columns for polling/filtering (denormalized from data_json)
      status TEXT,
      campaign_id TEXT,
      scheduled_at INTEGER,
      instance_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON jobs(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_jobs_campaign_ts ON jobs(campaign_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      job_id TEXT,
      instance_id TEXT,
      node_id TEXT,
      level TEXT NOT NULL DEFAULT 'info',
      event TEXT NOT NULL,
      message TEXT,
      data_json TEXT,
      created_at INTEGER NOT NULL
    );
    -- execution_logs grows fastest — index for campaign log view + node progress
    CREATE INDEX IF NOT EXISTS idx_el_campaign
      ON execution_logs(campaign_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_el_campaign_event
      ON execution_logs(campaign_id, event, instance_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS publish_accounts (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS publish_history (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      -- Index columns for dedup queries (denormalized from data_json)
      account_id TEXT,
      source_platform_id TEXT,
      file_fingerprint TEXT,
      status TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ph_account_source ON publish_history(account_id, source_platform_id);
    CREATE INDEX IF NOT EXISTS idx_ph_account_fingerprint ON publish_history(account_id, file_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_ph_account_status ON publish_history(account_id, status);

    -- Race-condition guard: only one active record per source video per account
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ph_active_source
      ON publish_history(account_id, source_platform_id)
      WHERE source_platform_id IS NOT NULL
        AND status IN ('uploading', 'under_review', 'published');
    -- Race-condition guard: only one active record per file content per account
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ph_active_fingerprint
      ON publish_history(account_id, file_fingerprint)
      WHERE file_fingerprint IS NOT NULL
        AND status IN ('uploading', 'under_review', 'published');

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at INTEGER
    );

    -- Async background tasks (generic polling system)
    CREATE TABLE IF NOT EXISTS async_tasks (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      task_type TEXT,
      status TEXT,
      dedupe_key TEXT,
      concurrency_key TEXT,
      campaign_id TEXT,
      owner_key TEXT,
      worker_id TEXT,
      next_run_at INTEGER,
      lease_until INTEGER,
      attempt INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_at_due ON async_tasks(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_at_type ON async_tasks(task_type, status);
    CREATE INDEX IF NOT EXISTS idx_at_campaign ON async_tasks(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_at_campaign_ts ON async_tasks(campaign_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_at_concurrency ON async_tasks(concurrency_key, status);
    CREATE INDEX IF NOT EXISTS idx_at_owner ON async_tasks(owner_key, status);
    CREATE INDEX IF NOT EXISTS idx_at_owner_ts ON async_tasks(owner_key, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_at_dedupe_active
      ON async_tasks(dedupe_key)
      WHERE status IN ('pending', 'claimed', 'running');
  `)
}

export function getDbPath() {
  return DB_PATH
}

export function initDb() {
  db.pragma('journal_mode = WAL')
  createSchema()
  migrateJobsInstanceIdColumn()
  backfillDenormalizedColumns()
  console.log('[DB] Schema initialized (document-store)')
}

/**
 * Migration: Add instance_id column to jobs table if not present.
 * Safe on fresh databases (column already in CREATE TABLE).
 * Needed for existing databases created before this column existed.
 */
function migrateJobsInstanceIdColumn() {
  try {
    const cols = db.prepare("PRAGMA table_info('jobs')").all() as Array<{ name: string }>
    if (!cols.some(c => c.name === 'instance_id')) {
      db.exec('ALTER TABLE jobs ADD COLUMN instance_id TEXT')
      // Backfill from data_json for existing rows
      const r = db.prepare(`
        UPDATE jobs SET instance_id = json_extract(data_json, '$.instance_id')
        WHERE instance_id IS NULL AND json_extract(data_json, '$.instance_id') IS NOT NULL
      `).run()
      if (r.changes > 0) {
        console.log(`[DB] Migration: backfilled instance_id for ${r.changes} existing jobs`)
      }
    }
  } catch (err) {
    console.warn('[DB] Migration jobs.instance_id (skipped):', (err as any)?.message || err)
  }
}

/**
 * One-time backfill: sync null index columns from data_json.
 * Runs on every startup but only touches rows where index columns are null.
 * Safe to re-run (idempotent).
 */
function backfillDenormalizedColumns() {
  let totalFixed = 0
  let totalStripped = 0

  // ── STEP 1: Populate null index columns from data_json (legacy rows) ──

  // async_tasks (dedupe_key excluded — partial unique index conflict)
  try {
    const r = db.prepare(`
      UPDATE async_tasks SET
        status        = COALESCE(status,        json_extract(data_json, '$.status')),
        task_type     = COALESCE(task_type,     json_extract(data_json, '$.taskType')),
        next_run_at   = COALESCE(next_run_at,   json_extract(data_json, '$.nextRunAt')),
        campaign_id   = COALESCE(campaign_id,   json_extract(data_json, '$.campaignId')),
        owner_key     = COALESCE(owner_key,     json_extract(data_json, '$.ownerKey')),
        concurrency_key = COALESCE(concurrency_key, json_extract(data_json, '$.concurrencyKey'))
      WHERE status IS NULL AND json_extract(data_json, '$.status') IS NOT NULL
    `).run()
    totalFixed += r.changes
  } catch (err) {
    console.warn('[DB] Backfill async_tasks (skipped):', (err as any)?.message || err)
  }

  // publish_history — row-by-row to handle unique partial index conflicts
  try {
    const rows = db.prepare(`
      SELECT id FROM publish_history
      WHERE status IS NULL AND json_extract(data_json, '$.status') IS NOT NULL
    `).all() as { id: string }[]
    const stmt = db.prepare(`
      UPDATE OR IGNORE publish_history SET
        status              = COALESCE(status,              json_extract(data_json, '$.status')),
        account_id          = COALESCE(account_id,          json_extract(data_json, '$.account_id')),
        source_platform_id  = COALESCE(source_platform_id,  json_extract(data_json, '$.source_platform_id')),
        file_fingerprint    = COALESCE(file_fingerprint,    json_extract(data_json, '$.file_fingerprint'))
      WHERE id = ?
    `)
    for (const row of rows) {
      try { totalFixed += stmt.run(row.id).changes } catch { /* skip conflicts */ }
    }
  } catch (err) {
    console.warn('[DB] Backfill publish_history (skipped):', (err as any)?.message || err)
  }

  // jobs
  try {
    const r = db.prepare(`
      UPDATE jobs SET
        status       = COALESCE(status,       json_extract(data_json, '$.status')),
        campaign_id  = COALESCE(campaign_id,  json_extract(data_json, '$.campaign_id')),
        scheduled_at = COALESCE(scheduled_at, json_extract(data_json, '$.scheduled_at')),
        instance_id  = COALESCE(instance_id,  json_extract(data_json, '$.instance_id'))
      WHERE status IS NULL AND json_extract(data_json, '$.status') IS NOT NULL
    `).run()
    totalFixed += r.changes
  } catch (err) {
    console.warn('[DB] Backfill jobs (skipped):', (err as any)?.message || err)
  }

  // ── STEP 2: Strip indexed fields from data_json (single source of truth) ──

  try {
    const r = db.prepare(`
      UPDATE async_tasks SET data_json = json_remove(data_json,
        '$.taskType', '$.status', '$.dedupeKey', '$.concurrencyKey',
        '$.campaignId', '$.ownerKey', '$.workerId', '$.nextRunAt',
        '$.leaseUntil', '$.attempt'
      ) WHERE json_extract(data_json, '$.status') IS NOT NULL
    `).run()
    totalStripped += r.changes
  } catch { /* non-fatal */ }

  try {
    const r = db.prepare(`
      UPDATE publish_history SET data_json = json_remove(data_json,
        '$.status', '$.account_id', '$.source_platform_id', '$.file_fingerprint'
      ) WHERE json_extract(data_json, '$.status') IS NOT NULL
    `).run()
    totalStripped += r.changes
  } catch { /* non-fatal */ }

  try {
    const r = db.prepare(`
      UPDATE jobs SET data_json = json_remove(data_json,
        '$.status', '$.campaign_id', '$.scheduled_at', '$.instance_id'
      ) WHERE json_extract(data_json, '$.status') IS NOT NULL
    `).run()
    totalStripped += r.changes
  } catch { /* non-fatal */ }

  if (totalFixed > 0) {
    console.log(`[DB] Backfill: populated ${totalFixed} null index columns from data_json`)
  }
  if (totalStripped > 0) {
    console.log(`[DB] Migration: stripped indexed fields from data_json in ${totalStripped} rows`)
  }
}

export function cleanDbSchema() {
  db.exec(`
    DROP TABLE IF EXISTS async_tasks;
    DROP TABLE IF EXISTS app_settings;
    DROP TABLE IF EXISTS publish_history;
    DROP TABLE IF EXISTS publish_accounts;
    DROP TABLE IF EXISTS execution_logs;
    DROP TABLE IF EXISTS jobs;
    DROP TABLE IF EXISTS campaigns;
  `)

  createSchema()

  return {
    success: true,
    dbPath: DB_PATH,
    message: 'DB schema cleaned and recreated',
  }
}

export function inspectDbSchema() {
  const tableRows = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string; sql: string | null }>
  const indexRows = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' ORDER BY name")
    .all() as Array<{ name: string; sql: string | null }>

  const tables = tableRows.map(r => r.name)
  const indexes = indexRows.map(r => r.name)

  const missingTables = REQUIRED_TABLES.filter(name => !tables.includes(name))
  const missingIndexes = REQUIRED_INDEXES.filter(name => !indexes.includes(name))

  const tableStats = REQUIRED_TABLES.map((name) => {
    const exists = tables.includes(name)
    let rowCount: number | null = null
    if (exists) {
      try {
        const row = db.prepare(`SELECT COUNT(1) as n FROM ${name}`).get() as { n?: number } | undefined
        rowCount = row?.n ?? 0
      } catch {
        rowCount = null
      }
    }
    return { name, exists, rowCount }
  })

  // ── Drift detection: check for null index columns that should have data ──
  const DRIFT_CHECKS = [
    { table: 'async_tasks', column: 'status', jsonPath: '$.status' },
    { table: 'publish_history', column: 'status', jsonPath: '$.status' },
    { table: 'jobs', column: 'status', jsonPath: '$.status' },
  ]
  const driftIssues: Array<{ table: string; column: string; driftedRows: number }> = []
  for (const check of DRIFT_CHECKS) {
    try {
      const result = db.prepare(
        `SELECT COUNT(*) as n FROM ${check.table} WHERE ${check.column} IS NULL AND json_extract(data_json, '${check.jsonPath}') IS NOT NULL`
      ).get() as { n: number }
      if (result.n > 0) {
        driftIssues.push({ table: check.table, column: check.column, driftedRows: result.n })
      }
    } catch { /* table may not exist yet */ }
  }

  return {
    dbPath: DB_PATH,
    healthy: missingTables.length === 0 && missingIndexes.length === 0 && driftIssues.length === 0,
    checkedAt: Date.now(),
    tables,
    indexes,
    missingTables,
    missingIndexes,
    driftIssues,
    tableStats,
    tableDefinitions: tableRows.map(r => ({ name: r.name, sql: r.sql || '' })),
  }
}

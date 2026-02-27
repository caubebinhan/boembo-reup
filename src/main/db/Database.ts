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
  'idx_ph_account_source',
  'idx_ph_account_fingerprint',
  'idx_ph_account_status',
  'idx_at_due',
  'idx_at_type',
  'idx_at_campaign',
  'idx_at_concurrency',
  'idx_at_owner',
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
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON jobs(campaign_id, status);

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
    CREATE INDEX IF NOT EXISTS idx_at_concurrency ON async_tasks(concurrency_key, status);
    CREATE INDEX IF NOT EXISTS idx_at_owner ON async_tasks(owner_key, status);
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
  console.log('[DB] Schema initialized (document-store)')
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

  return {
    dbPath: DB_PATH,
    healthy: missingTables.length === 0 && missingIndexes.length === 0,
    checkedAt: Date.now(),
    tables,
    indexes,
    missingTables,
    missingIndexes,
    tableStats,
    tableDefinitions: tableRows.map(r => ({ name: r.name, sql: r.sql || '' })),
  }
}

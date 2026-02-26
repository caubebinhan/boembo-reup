import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

const DB_PATH = join(app.getPath('userData'), 'repost_io.db')

export const db: BetterSqlite3Database = new Database(DB_PATH)

export function initDb() {
  db.pragma('journal_mode = WAL')

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
  `)

  console.log('[DB] Schema initialized (document-store)')
}

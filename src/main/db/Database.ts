import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

// Create or open DB
export const db: BetterSqlite3Database = new Database(join(app.getPath('userData'), 'repost_io.db'))

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      name TEXT NOT NULL,
      params TEXT NOT NULL,
      status TEXT DEFAULT 'idle',
      created_at INTEGER,
      updated_at INTEGER,
      queued_count INTEGER DEFAULT 0,
      downloaded_count INTEGER DEFAULT 0,
      published_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS videos (
      platform_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      status TEXT DEFAULT 'queued',
      publish_url TEXT,
      local_path TEXT,
      data_json TEXT,
      scheduled_for INTEGER,
      queue_index INTEGER DEFAULT 0,
      PRIMARY KEY (platform_id, campaign_id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      data_json TEXT NOT NULL,
      error_message TEXT,
      scheduled_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

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
      platform TEXT NOT NULL DEFAULT 'tiktok',
      username TEXT NOT NULL,
      handle TEXT,
      avatar TEXT,
      cookies_json TEXT,
      proxy TEXT,
      session_status TEXT DEFAULT 'active',
      auto_caption INTEGER DEFAULT 0,
      auto_tags TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS publish_history (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL DEFAULT 'tiktok',
      account_id TEXT NOT NULL,
      account_username TEXT,
      campaign_id TEXT,
      source_platform_id TEXT,
      source_local_path TEXT,
      file_fingerprint TEXT,
      caption_hash TEXT,
      caption_preview TEXT,
      published_video_id TEXT,
      published_url TEXT,
      status TEXT NOT NULL DEFAULT 'under_review',
      duplicate_reason TEXT,
      media_signature_json TEXT,
      media_signature_version TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_publish_history_account_source
      ON publish_history(account_id, source_platform_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_publish_history_account_fingerprint
      ON publish_history(account_id, file_fingerprint, updated_at DESC);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT,
      updated_at INTEGER
    );
  `)

  // Migrations for existing DBs
  const migrations = [
    'ALTER TABLE videos ADD COLUMN data_json TEXT',
    'ALTER TABLE videos ADD COLUMN scheduled_for INTEGER',
    'ALTER TABLE videos ADD COLUMN queue_index INTEGER DEFAULT 0',
    'ALTER TABLE campaigns ADD COLUMN last_processed_index INTEGER DEFAULT 0',
    'ALTER TABLE publish_history ADD COLUMN media_signature_json TEXT',
    'ALTER TABLE publish_history ADD COLUMN media_signature_version TEXT',
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // Migrate videos table from old single-column PK to composite PK
  try {
    const tableInfo = db.prepare("PRAGMA table_info('videos')").all() as any[]
    const pkColumns = tableInfo.filter((c: any) => c.pk > 0)
    // Old schema has single PK on platform_id; new schema has composite PK
    if (pkColumns.length === 1 && pkColumns[0].name === 'platform_id') {
      console.log('[DB Migration] Migrating videos table to composite PK (platform_id, campaign_id)...')
      db.exec(`
        ALTER TABLE videos RENAME TO videos_old;
        CREATE TABLE videos (
          platform_id TEXT NOT NULL,
          campaign_id TEXT NOT NULL,
          status TEXT DEFAULT 'queued',
          publish_url TEXT,
          local_path TEXT,
          data_json TEXT,
          scheduled_for INTEGER,
          queue_index INTEGER DEFAULT 0,
          PRIMARY KEY (platform_id, campaign_id)
        );
        INSERT OR IGNORE INTO videos (platform_id, campaign_id, status, publish_url, local_path, data_json, scheduled_for, queue_index)
          SELECT platform_id, COALESCE(campaign_id, ''), status, publish_url, local_path, data_json, scheduled_for, queue_index FROM videos_old;
        DROP TABLE videos_old;
      `)
      console.log('[DB Migration] Videos table migrated successfully')
    }
  } catch (e) {
    console.error('[DB Migration] Videos PK migration failed (may already be done):', e)
  }
}

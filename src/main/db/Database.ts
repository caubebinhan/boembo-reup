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
      platform_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      publish_url TEXT,
      local_path TEXT
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
  `)
}

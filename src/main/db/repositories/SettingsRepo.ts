import { db } from '../Database'

/**
 * Settings Repository — key-value store for app settings.
 * Uses a simple id + data_json table.
 */
export class SettingsRepository {
  get<T = any>(key: string, fallback?: T): T | null {
    try {
      const row = db
        .prepare('SELECT data_json FROM app_settings WHERE id = ?')
        .get(key) as { data_json: string } | undefined
      if (!row?.data_json) return fallback ?? null
      return JSON.parse(row.data_json) as T
    } catch {
      return fallback ?? null
    }
  }

  set<T = any>(key: string, value: T): void {
    db.prepare(
      `INSERT OR REPLACE INTO app_settings (id, data_json, updated_at)
       VALUES (?, ?, ?)`
    ).run(key, JSON.stringify(value), Date.now())
  }

  delete(key: string): void {
    db.prepare('DELETE FROM app_settings WHERE id = ?').run(key)
  }
}

export const settingsRepo = new SettingsRepository()

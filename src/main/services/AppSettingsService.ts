import { db } from '../db/Database'

export interface AutomationBrowserSettings {
  browserId?: string
  browserName?: string
  executablePath?: string
  userDataDir?: string
  profileDirectory?: string
  profilePath?: string
  locale?: string
}

const AUTOMATION_BROWSER_KEY = 'automation.browser'

export class AppSettingsService {
  static getJson<T>(key: string, fallback: T): T {
    try {
      const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as any
      if (!row?.value_json) return fallback
      return JSON.parse(row.value_json) as T
    } catch {
      return fallback
    }
  }

  static setJson<T>(key: string, value: T): void {
    const now = Date.now()
    db.prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value ?? null), now)
  }

  static getAutomationBrowserSettings(): AutomationBrowserSettings {
    return this.getJson<AutomationBrowserSettings>(AUTOMATION_BROWSER_KEY, {
      locale: 'en-US',
    })
  }

  static setAutomationBrowserSettings(value: AutomationBrowserSettings): void {
    this.setJson(AUTOMATION_BROWSER_KEY, {
      locale: value.locale || 'en-US',
      browserId: value.browserId || '',
      browserName: value.browserName || '',
      executablePath: value.executablePath || '',
      userDataDir: value.userDataDir || '',
      profileDirectory: value.profileDirectory || '',
      profilePath: value.profilePath || '',
    })
  }
}

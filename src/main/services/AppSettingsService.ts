import path from 'path'
import os from 'os'
import { settingsRepo } from '../db/repositories/SettingsRepo'

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
const MEDIA_STORAGE_KEY = 'media.storagePath'
const DEFAULT_STORAGE_DIR = path.join(os.homedir(), 'boembo-downloads')
const FIXED_THUMBS_DIR = path.join(os.homedir(), '.boembo', 'thumbs')

/**
 * AppSettingsService — typed delegate to SettingsRepository.
 */
export class AppSettingsService {
  static getJson<T>(key: string, fallback: T): T {
    return settingsRepo.get<T>(key, fallback) ?? fallback
  }

  static setJson<T>(key: string, value: T): void {
    settingsRepo.set(key, value)
  }

  // ── Automation Browser ──────────────────────────────

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

  // ── Media Storage ───────────────────────────────────

  static getMediaStoragePath(): string {
    return this.getJson<string>(MEDIA_STORAGE_KEY, DEFAULT_STORAGE_DIR)
  }

  static setMediaStoragePath(dirPath: string): void {
    this.setJson(MEDIA_STORAGE_KEY, dirPath || DEFAULT_STORAGE_DIR)
  }

  /** Fixed path — thumbnails survive media folder changes */
  static getThumbsDir(): string {
    return FIXED_THUMBS_DIR
  }

  static getDefaultStoragePath(): string {
    return DEFAULT_STORAGE_DIR
  }
}

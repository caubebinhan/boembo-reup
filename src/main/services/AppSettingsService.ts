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

export interface SentryConnectedProject {
  id: string
  slug: string
  name?: string
  platform?: string
  dsnPublic?: string
}

export interface SentryOAuthConnectionSettings {
  provider: 'sentry-oauth-device'
  baseUrl: string
  connectedAt: number
  orgSlug: string
  accessToken: string
  refreshToken?: string
  tokenType?: string
  tokenScope?: string
  tokenExpiresAt?: number
  projects: SentryConnectedProject[]
  selectedProductionProjectSlug?: string
  selectedStagingProjectSlug?: string
}

const AUTOMATION_BROWSER_KEY = 'automation.browser'
const MEDIA_STORAGE_KEY = 'media.storagePath'
const SENTRY_OAUTH_CONNECTION_KEY = 'sentry.oauth.connection.v1'
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

  static getSentryOAuthConnection(): SentryOAuthConnectionSettings | null {
    return this.getJson<SentryOAuthConnectionSettings | null>(SENTRY_OAUTH_CONNECTION_KEY, null)
  }

  static setSentryOAuthConnection(value: SentryOAuthConnectionSettings): void {
    this.setJson(SENTRY_OAUTH_CONNECTION_KEY, value)
  }

  static clearSentryOAuthConnection(): void {
    settingsRepo.delete(SENTRY_OAUTH_CONNECTION_KEY)
  }

  static getSentryRuntimeEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const out: NodeJS.ProcessEnv = { ...baseEnv }
    const connected = this.getSentryOAuthConnection()
    if (!connected) return out

    const projects = Array.isArray(connected.projects) ? connected.projects : []
    const bySlug = new Map(projects.map(p => [p.slug, p]))
    const stageProject = bySlug.get(connected.selectedStagingProjectSlug || '') ||
      projects.find(p => /staging/i.test(p.slug)) ||
      projects[0]
    const prodProject = bySlug.get(connected.selectedProductionProjectSlug || '') ||
      projects.find(p => !/staging/i.test(p.slug)) ||
      projects[0]

    if (!out.SENTRY_STAGING_AUTH_TOKEN && connected.accessToken) out.SENTRY_STAGING_AUTH_TOKEN = connected.accessToken
    if (!out.SENTRY_STAGING_ORG && connected.orgSlug) out.SENTRY_STAGING_ORG = connected.orgSlug
    if (!out.SENTRY_STAGING_PROJECT && stageProject?.slug) out.SENTRY_STAGING_PROJECT = stageProject.slug
    if (!out.SENTRY_STAGING_DSN && stageProject?.dsnPublic) out.SENTRY_STAGING_DSN = stageProject.dsnPublic
    if (!out.SENTRY_STAGING_BASE_URL && connected.baseUrl) out.SENTRY_STAGING_BASE_URL = connected.baseUrl

    if (!out.SENTRY_PRODUCTION_DSN && prodProject?.dsnPublic) out.SENTRY_PRODUCTION_DSN = prodProject.dsnPublic
    if (!out.VITE_SENTRY_DSN_PRODUCTION && prodProject?.dsnPublic) out.VITE_SENTRY_DSN_PRODUCTION = prodProject.dsnPublic
    if (!out.VITE_SENTRY_DSN && prodProject?.dsnPublic) out.VITE_SENTRY_DSN = prodProject.dsnPublic

    return out
  }
}

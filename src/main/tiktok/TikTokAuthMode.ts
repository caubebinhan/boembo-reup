import { AppSettingsService } from '@main/services/AppSettingsService'

export type TikTokAuthMode = 'profile' | 'cookie'

export function resolveTikTokAuthMode(): TikTokAuthMode {
  const settings = AppSettingsService.getAutomationBrowserSettings()
  const userDataDir = String(settings.userDataDir || '').trim()
  return userDataDir ? 'profile' : 'cookie'
}

export function shouldUseProfileSession(): boolean {
  return resolveTikTokAuthMode() === 'profile'
}

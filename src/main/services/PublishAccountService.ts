import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { AppSettingsService } from './AppSettingsService'
import { accountRepo } from '../db/repositories/AccountRepo'
import type { AccountDocument } from '../db/models/Account'

type ExtractedProfileInfo = {
  username?: string
  handle?: string
  avatar?: string
}

const GENERIC_TIKTOK_TITLES = new Set([
  'TikTok - Make Your Day',
  'TikTok',
])

export class PublishAccountService {
  static listAccounts(): AccountDocument[] {
    return accountRepo.findAll()
  }

  static getAccount(id: string): AccountDocument | null {
    return accountRepo.findById(id)
  }

  static deleteAccount(id: string): void {
    accountRepo.delete(id)
    console.log(`[AccountService] Deleted account: ${id}`)
  }

  static updateSessionStatus(id: string, status: 'active' | 'expired'): void {
    const doc = accountRepo.findById(id)
    if (!doc) return
    doc.session_status = status
    doc.updated_at = Date.now()
    accountRepo.save(doc)
  }

  private static normalizeHandle(raw?: string): string {
    const v = (raw || '').trim()
    if (!v) return ''
    return v.startsWith('@') ? v : `@${v.replace(/^@+/, '')}`
  }

  private static sanitizeUsername(raw?: string): string {
    const value = (raw || '').trim()
    if (!value) return ''
    return GENERIC_TIKTOK_TITLES.has(value) ? '' : value
  }

  private static async extractProfileInfo(win: BrowserWindow): Promise<ExtractedProfileInfo> {
    try {
      const result = await win.webContents.executeJavaScript(`
        (() => {
          const txt = (el) => (el?.textContent || '').trim()
          const first = (selectors) => {
            for (const sel of selectors) {
              const el = document.querySelector(sel)
              if (!el) continue
              const h = el
              const style = window.getComputedStyle(h)
              const visible = !!(h.offsetWidth || h.offsetHeight || h.getClientRects().length) &&
                style.visibility !== 'hidden' && style.display !== 'none'
              if (visible || txt(el)) return el
            }
            return null
          }

          const out = {
            username: txt(first([
              '[data-e2e="user-title"]',
              '[data-e2e="top-nav-user-name"]',
              '[data-e2e="profile-name"]',
              'h1[data-e2e]',
              'h2[data-e2e]'
            ])),
            handle: txt(first([
              '[data-e2e="user-subtitle"]',
              '[data-e2e="top-nav-user-handle"]',
              '[data-e2e="profile-unique-id"]',
              'a[href^="/@"]'
            ])),
            avatar: (first([
              'img[data-e2e="user-avatar"]',
              'img[class*="avatar"]'
            ])?.getAttribute?.('src')) || ''
          }

          if (!out.handle) {
            for (const a of Array.from(document.querySelectorAll('a[href*="/@"]'))) {
              const href = a.getAttribute('href') || ''
              const m = href.match(/\\/@([A-Za-z0-9._-]+)/)
              if (m) { out.handle = '@' + m[1]; break }
            }
          }
          if (!out.handle) {
            const m = location.pathname.match(/\\/@([A-Za-z0-9._-]+)/)
            if (m) out.handle = '@' + m[1]
          }
          if (!out.username) {
            const titleHead = (document.title || '').split('|')[0]?.trim()
            if (titleHead && !titleHead.startsWith('@')) out.username = titleHead
          }

          const roots = []
          try { if (window.SIGI_STATE) roots.push(window.SIGI_STATE) } catch {}
          try { if (window.__UNIVERSAL_DATA_FOR_REHYDRATION__) roots.push(window.__UNIVERSAL_DATA_FOR_REHYDRATION__) } catch {}
          for (const id of ['SIGI_STATE', '__UNIVERSAL_DATA_FOR_REHYDRATION__']) {
            const el = document.getElementById(id)
            if (el?.textContent) {
              try { roots.push(JSON.parse(el.textContent)) } catch {}
            }
          }

          const deepFind = (obj, depth = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 7) return null
            if (obj.uniqueId || obj.unique_id || obj.nickname || obj.nickName || obj.username) return obj
            for (const key of Object.keys(obj)) {
              const v = obj[key]
              if (v && typeof v === 'object') {
                const found = deepFind(v, depth + 1)
                if (found) return found
              }
            }
            return null
          }

          for (const root of roots) {
            const user = deepFind(root)
            if (!user) continue
            if (!out.handle) {
              const h = user.uniqueId || user.unique_id || user.username
              if (h) out.handle = String(h).startsWith('@') ? String(h) : '@' + String(h)
            }
            if (!out.username) {
              out.username = user.nickname || user.nickName || user.displayName || user.username || out.username
            }
            if (!out.avatar) {
              out.avatar = user.avatarThumb || user.avatarLarger || user.avatar || out.avatar
            }
            if (out.username && out.handle) break
          }

          return out
        })()
      `)
      return result || {}
    } catch {
      return {}
    }
  }

  private static async resolveLoggedInProfile(win: BrowserWindow): Promise<ExtractedProfileInfo> {
    const pages = [
      'https://www.tiktok.com/foryou',
      'https://www.tiktok.com/',
      'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
      'https://www.tiktok.com/profile',
    ]

    let merged: ExtractedProfileInfo = {}
    for (const url of pages) {
      try {
        await win.loadURL(url)
        for (let i = 0; i < 4; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const info = await this.extractProfileInfo(win)
          if (info.username) info.username = this.sanitizeUsername(info.username)
          merged = { ...merged, ...info }
          if (merged.username && merged.handle) break
        }
        if (merged.username && merged.handle) break
      } catch {
        // keep trying other pages
      }
    }

    const normalizedHandle = this.normalizeHandle(merged.handle)
    if (normalizedHandle && !this.sanitizeUsername(merged.username)) {
      try {
        await win.loadURL(`https://www.tiktok.com/${normalizedHandle}`)
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const profileInfo = await this.extractProfileInfo(win)
          if (profileInfo.username) merged.username = this.sanitizeUsername(profileInfo.username) || merged.username
          if (profileInfo.avatar) merged.avatar = profileInfo.avatar
          if (this.sanitizeUsername(merged.username)) break
        }
      } catch {
        // ignore, fallback below
      }
    }

    if (!this.sanitizeUsername(merged.username) && normalizedHandle) {
      merged.username = normalizedHandle.replace(/^@/, '')
    }

    return merged
  }

  static async addAccountViaLogin(parentWindow?: BrowserWindow): Promise<AccountDocument | null> {
    return new Promise((resolve) => {
      let settled = false
      let profileResolveAttempts = 0
      const done = (value: AccountDocument | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      const loginWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: parentWindow || undefined,
        modal: !!parentWindow,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        title: 'Login to TikTok',
      })

      const automationSettings = AppSettingsService.getAutomationBrowserSettings()
      const locale = (automationSettings.locale || 'en-US').trim()
      try {
        const currentUA = loginWindow.webContents.userAgent || ''
        // @ts-ignore
        loginWindow.webContents.session.setUserAgent(currentUA, locale)
      } catch {}

      const langCode = locale.split('-')[0] || 'en'
      loginWindow.loadURL(`https://www.tiktok.com/login?lang=${encodeURIComponent(langCode)}`)
      console.log('[AccountService] Opened TikTok login window')

      const checkInterval = setInterval(async () => {
        try {
          const cookies = await loginWindow.webContents.session.cookies.get({ domain: '.tiktok.com' })
          const sessionCookie = cookies.find(c => c.name === 'sessionid' || c.name === 'sid_tt')

          if (!sessionCookie) return

          let profile: ExtractedProfileInfo = await this.resolveLoggedInProfile(loginWindow).catch(
            (): ExtractedProfileInfo => ({})
          )
          const handle = this.normalizeHandle(profile.handle)
          const username = this.sanitizeUsername(profile.username) || handle.replace(/^@/, '') || 'TikTok User'

          if (!handle) {
            profileResolveAttempts++
            console.warn(`[AccountService] Session cookie found but handle not extracted yet (attempt ${profileResolveAttempts})`)
            return
          }

          console.log(`[AccountService] Login detected - resolved ${username} (${handle})`)
          clearInterval(checkInterval)
          const avatar = (profile.avatar || '').trim() || undefined

          const allCookies = await loginWindow.webContents.session.cookies.get({ domain: '.tiktok.com' })
          const cookiesData = allCookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite,
            expirationDate: c.expirationDate,
          }))

          const now = Date.now()
          const doc: AccountDocument = {
            id: randomUUID(),
            platform: 'tiktok',
            username,
            handle,
            avatar,
            cookies: cookiesData,
            session_status: 'active',
            auto_caption: false,
            created_at: now,
            updated_at: now,
          }

          accountRepo.save(doc)

          console.log(`[AccountService] Saved account: ${doc.username} (${doc.handle})`)
          try { loginWindow.close() } catch {}
          done(doc)
        } catch {
          clearInterval(checkInterval)
          done(null)
        }
      }, 2000)

      loginWindow.on('closed', () => {
        clearInterval(checkInterval)
        done(null)
      })
    })
  }

  static getCookiesForAccount(id: string): any[] {
    const doc = accountRepo.findById(id)
    if (!doc?.cookies) return []
    return Array.isArray(doc.cookies) ? doc.cookies : []
  }
}

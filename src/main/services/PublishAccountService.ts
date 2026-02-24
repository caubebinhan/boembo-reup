import { db } from '../db/Database'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'

interface PublishAccount {
  id: string
  platform: string
  username: string
  handle: string
  avatar?: string
  cookies_json?: string
  proxy?: string
  session_status: 'active' | 'expired'
  auto_caption: boolean
  auto_tags?: string
  created_at: number
  updated_at: number
}

/**
 * PublishAccountService — manages TikTok publish accounts
 * Handles: CRUD, browser login for cookie capture, session validation
 */
export class PublishAccountService {

  /** Get all accounts */
  static listAccounts(): PublishAccount[] {
    const rows = db.prepare('SELECT * FROM publish_accounts ORDER BY created_at DESC').all() as any[]
    return rows.map(r => ({
      ...r,
      auto_caption: Boolean(r.auto_caption),
    }))
  }

  /** Get a single account by ID */
  static getAccount(id: string): PublishAccount | null {
    const row = db.prepare('SELECT * FROM publish_accounts WHERE id = ?').get(id) as any
    if (!row) return null
    return { ...row, auto_caption: Boolean(row.auto_caption) }
  }

  /** Delete an account */
  static deleteAccount(id: string): void {
    db.prepare('DELETE FROM publish_accounts WHERE id = ?').run(id)
    console.log(`[AccountService] Deleted account: ${id}`)
  }

  /** Update session status */
  static updateSessionStatus(id: string, status: 'active' | 'expired'): void {
    db.prepare('UPDATE publish_accounts SET session_status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id)
  }

  /**
   * Open a TikTok login BrowserWindow, wait for user to log in,
   * capture cookies, and save the account.
   */
  static async addAccountViaLogin(parentWindow?: BrowserWindow): Promise<PublishAccount | null> {
    return new Promise((resolve) => {
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

      loginWindow.loadURL('https://www.tiktok.com/login')
      console.log('[AccountService] Opened TikTok login window')

      // Poll for logged-in state by checking cookies
      const checkInterval = setInterval(async () => {
        try {
          const cookies = await loginWindow.webContents.session.cookies.get({ domain: '.tiktok.com' })
          const sessionCookie = cookies.find(c => c.name === 'sessionid' || c.name === 'sid_tt')

          if (sessionCookie) {
            console.log(`[AccountService] Login detected — sessionid cookie found`)
            clearInterval(checkInterval)

            // Get user info from page
            let username = 'TikTok User'
            let handle = ''
            try {
              const userInfo = await loginWindow.webContents.executeJavaScript(`
                (() => {
                  try {
                    const el = document.querySelector('[data-e2e="user-title"]') || 
                               document.querySelector('.tiktok-qcnhbu-SpanNickName') ||
                               document.querySelector('h2[data-e2e="user-subtitle"]')
                    const handleEl = document.querySelector('[data-e2e="user-subtitle"]') ||
                                     document.querySelector('.tiktok-1d3bdxn-SpanUniqueId')
                    return {
                      username: el?.textContent || '',
                      handle: handleEl?.textContent || ''
                    }
                  } catch { return {} }
                })()
              `)
              if (userInfo.username) username = userInfo.username
              if (userInfo.handle) handle = userInfo.handle
            } catch {
              // Navigate to profile to get username
              try {
                await loginWindow.loadURL('https://www.tiktok.com/profile')
                await new Promise(r => setTimeout(r, 2000))
                const profileInfo = await loginWindow.webContents.executeJavaScript(`
                  (() => {
                    const title = document.title || ''
                    const match = title.match(/@([\\w.]+)/)
                    return { handle: match ? '@' + match[1] : '', username: title.split('|')[0]?.trim() || '' }
                  })()
                `)
                if (profileInfo.username) username = profileInfo.username
                if (profileInfo.handle) handle = profileInfo.handle
              } catch { /* ignore */ }
            }

            // Serialize all TikTok cookies
            const allCookies = await loginWindow.webContents.session.cookies.get({ domain: '.tiktok.com' })
            const cookiesJson = JSON.stringify(allCookies.map(c => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite: c.sameSite,
              expirationDate: c.expirationDate,
            })))

            const account: PublishAccount = {
              id: randomUUID(),
              platform: 'tiktok',
              username: username || 'TikTok User',
              handle: handle || '@unknown',
              cookies_json: cookiesJson,
              session_status: 'active',
              auto_caption: false,
              created_at: Date.now(),
              updated_at: Date.now(),
            }

            // Save to DB
            db.prepare(`
              INSERT INTO publish_accounts (id, platform, username, handle, cookies_json, session_status, auto_caption, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              account.id, account.platform, account.username, account.handle,
              account.cookies_json, account.session_status,
              account.auto_caption ? 1 : 0,
              account.created_at, account.updated_at
            )

            console.log(`[AccountService] Saved account: ${account.username} (${account.handle})`)
            loginWindow.close()
            resolve(account)
          }
        } catch (err) {
          // Window might be closed
          clearInterval(checkInterval)
          resolve(null)
        }
      }, 2000)

      // Handle window close before login
      loginWindow.on('closed', () => {
        clearInterval(checkInterval)
        resolve(null)
      })
    })
  }

  /** Get cookies as array for use in browser automation */
  static getCookiesForAccount(id: string): any[] {
    const account = this.getAccount(id)
    if (!account?.cookies_json) return []
    try {
      return JSON.parse(account.cookies_json)
    } catch {
      return []
    }
  }
}

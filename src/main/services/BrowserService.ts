import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
import { AppSettingsService, AutomationBrowserSettings } from './AppSettingsService'

type ResolvedBrowserRuntime = {
  locale: string
  executablePath?: string
  userDataDir?: string
  profileDirectory?: string
}

class BrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private lastRuntimeKey = ''

  private getRuntime(): ResolvedBrowserRuntime {
    const cfg: AutomationBrowserSettings = AppSettingsService.getAutomationBrowserSettings()
    return {
      locale: cfg.locale || 'en-US',
      executablePath: cfg.executablePath || undefined,
      userDataDir: cfg.userDataDir || undefined,
      profileDirectory: cfg.profileDirectory || undefined,
    }
  }

  private makeRuntimeKey(runtime: ResolvedBrowserRuntime, headless: boolean): string {
    return JSON.stringify({
      headless,
      locale: runtime.locale,
      executablePath: runtime.executablePath || '',
      userDataDir: runtime.userDataDir || '',
      profileDirectory: runtime.profileDirectory || '',
    })
  }

  private buildCommonContextOptions(runtime: ResolvedBrowserRuntime) {
    return {
      viewport: null as null,
      locale: runtime.locale,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': `${runtime.locale},${runtime.locale.split('-')[0]};q=0.9,en;q=0.8`,
      },
    }
  }

  private buildLaunchArgs(runtime: ResolvedBrowserRuntime): string[] {
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      `--lang=${runtime.locale}`,
    ]
    if (runtime.profileDirectory) {
      args.push(`--profile-directory=${runtime.profileDirectory}`)
    }
    return args
  }

  async init(headless: boolean = false) {
    const runtime = this.getRuntime()
    const runtimeKey = this.makeRuntimeKey(runtime, headless)

    if (this.context && this.lastRuntimeKey !== runtimeKey) {
      await this.close()
    }

    if (this.context) return

    const commonContextOptions = this.buildCommonContextOptions(runtime)
    const launchArgs = this.buildLaunchArgs(runtime)

    if (runtime.userDataDir) {
      try {
        this.context = await chromium.launchPersistentContext(runtime.userDataDir, {
          headless,
          executablePath: runtime.executablePath,
          args: launchArgs,
          ...commonContextOptions,
        })
        this.browser = this.context.browser()
      } catch (err: any) {
        console.warn('[BrowserService] Persistent profile launch failed; falling back to clean context:', err?.message || err)
        this.browser = await chromium.launch({
          headless,
          executablePath: runtime.executablePath,
          args: this.buildLaunchArgs({ ...runtime, profileDirectory: undefined }),
        })
        this.context = await this.browser.newContext(commonContextOptions)
      }
    } else {
      this.browser = await chromium.launch({
        headless,
        executablePath: runtime.executablePath,
        args: launchArgs,
      })
      this.context = await this.browser.newContext(commonContextOptions)
    }

    this.lastRuntimeKey = runtimeKey
  }

  async newPage(): Promise<Page | null> {
    if (!this.context) return null
    return await this.context.newPage()
  }

  async close() {
    if (this.context) {
      await this.context.close().catch(() => {})
      this.context = null
    }
    if (this.browser) {
      await this.browser.close().catch(() => {})
      this.browser = null
    }
    this.lastRuntimeKey = ''
  }
}

export const browserService = new BrowserService()

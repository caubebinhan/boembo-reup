import { chromium, Browser, BrowserContext, Page } from 'playwright-core'

class BrowserService {
    private browser: Browser | null = null
    private context: BrowserContext | null = null

    async init(headless: boolean = false) {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: headless,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized'
                ]
            })
        }
        if (!this.context) {
            this.context = await this.browser.newContext({
                viewport: null,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
        }
    }

    async newPage(): Promise<Page | null> {
        if (!this.context) return null
        return await this.context.newPage()
    }

    async close() {
        if (this.context) {
            await this.context.close()
            this.context = null
        }
        if (this.browser) {
            await this.browser.close()
            this.browser = null
        }
    }
}

export const browserService = new BrowserService()

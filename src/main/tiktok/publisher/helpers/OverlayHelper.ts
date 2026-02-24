import { Page } from 'playwright-core'

export class OverlayHelper {
    constructor(private page: Page, public onProgress?: (msg: string) => void) { }

    async clean() {
        try {
            // Remove obstructing overlays that block clicks
            await this.page.evaluate(() => {
                const selectors = [
                    'div[role="dialog"]',
                    '.modal',
                    '[class*="overlay"]'
                ]
                selectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        const style = window.getComputedStyle(el)
                        if (style.zIndex && parseInt(style.zIndex) > 100) {
                            (el as HTMLElement).style.display = 'none'
                        }
                    })
                })
            })
        } catch (e) { }
    }

    async interactWithRetry(action: () => Promise<void>, contextMsg?: string) {
        if (contextMsg) { console.log(`[Overlay] Retrying interaction for: ${contextMsg}`) }
        for (let i = 0; i < 3; i++) {
            try {
                await action()
                return
            } catch (err: any) {
                if (i === 2) throw err
                await this.clean()
                await this.page.waitForTimeout(1000)
            }
        }
    }
}

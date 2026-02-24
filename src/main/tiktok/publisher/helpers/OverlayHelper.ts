import { Page } from 'playwright-core'

export class OverlayHelper {
    constructor(private page: Page, public onProgress?: (msg: string) => void) { }

    async clean() {
        try {
            // Step 1: Press Escape to dismiss any modal/dialog
            await this.page.keyboard.press('Escape').catch(() => {})
            await this.page.waitForTimeout(300)

            // Step 2: Click known close buttons
            const closeSelectors = [
                '[data-e2e="modal-close"]',
                'button[aria-label="Close"]',
                'button[aria-label="close"]',
                'button[aria-label="Đóng"]',
                'div[role="dialog"] button:has(svg)',  // generic X icon buttons in dialogs
            ]

            for (const sel of closeSelectors) {
                try {
                    const btn = this.page.locator(sel).first()
                    if (await btn.isVisible({ timeout: 500 })) {
                        await btn.click()
                        console.log(`[OverlayHelper] Dismissed overlay via: ${sel}`)
                        await this.page.waitForTimeout(500)
                    }
                } catch {}
            }

            // Step 3: Remove obstructing overlays that block clicks
            await this.page.evaluate(() => {
                // Kill react-joyride tour overlay immediately (TikTok onboarding)
                const joyride = document.getElementById('react-joyride-portal')
                if (joyride) {
                    joyride.remove()
                    console.log('[OverlayHelper] Removed react-joyride-portal')
                }

                const selectors = [
                    'div[role="dialog"]',
                    '.modal',
                    '[class*="overlay"]',
                    '[class*="Overlay"]',
                    '[class*="cookie"]',
                    '[class*="Cookie"]',
                    '[class*="notification"]',
                    '[class*="banner"]',
                    '[data-test-id="overlay"]',
                    '.react-joyride__overlay',
                ]
                selectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        const style = window.getComputedStyle(el)
                        const zIndex = parseInt(style.zIndex) || 0
                        const position = style.position
                        // Remove high z-index overlays or fixed/sticky positioned overlays
                        if (zIndex > 100 || position === 'fixed' || position === 'sticky') {
                            // Don't remove the main upload container
                            if (el.querySelector('input[type="file"]')) return
                            if (el.querySelector('[data-e2e="post_video_button"]')) return
                            ;(el as HTMLElement).style.display = 'none'
                        }
                    })
                })
            })
        } catch (e) {
            console.log('[OverlayHelper] Clean failed (non-critical):', e)
        }
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

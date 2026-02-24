import { Page } from 'playwright-core'
import { TIKTOK_SELECTORS } from './constants/selectors'
import { DebugHelper } from './helpers/DebugHelper'

// ── Caption setter for TikTok upload form ────────────────────────────────────

export class CaptionSetter {
    constructor(private page: Page, private onProgress?: (msg: string) => void) {}

    async setCaption(caption: string): Promise<void> {
        console.log('[CaptionSetter] Setting caption...')
        this.progress('Setting video caption...')

        for (const sel of TIKTOK_SELECTORS.CAPTION.EDITOR) {
            try {
                const editor = this.page.locator(sel).first()
                if (await editor.isVisible({ timeout: 3000 })) {
                    console.log(`[CaptionSetter] Found editor: ${sel}`)
                    this.progress('Typing caption...')

                    await editor.click()
                    await this.page.waitForTimeout(300)
                    await this.page.keyboard.press('Control+a')
                    await this.page.keyboard.press('Backspace')
                    await this.page.waitForTimeout(200)
                    await this.page.keyboard.type(caption, { delay: 15 })

                    console.log(`[CaptionSetter] Caption set via: ${sel}`)
                    return
                }
            } catch (e: any) {
                console.log(`[CaptionSetter] Selector ${sel} failed: ${e.message}`)
            }
        }

        // Caption failed — dump debug but don't throw (non-fatal)
        console.warn('[CaptionSetter] Could not find caption editor — continuing without caption')
        await DebugHelper.dumpPageState(this.page, 'caption_not_found')
    }

    private progress(msg: string) {
        if (this.onProgress) this.onProgress(msg)
    }
}

import { Page } from 'playwright-core'
import { TIKTOK_SELECTORS } from './constants/selectors'
import { DebugHelper } from './helpers/DebugHelper'
import { CodedError } from '@core/errors/CodedError'

// ── Post button submitter ────────────────────────────────────────────────────

export class PostSubmitter {
    constructor(private page: Page, private onProgress?: (msg: string) => void) {}

    async submit(): Promise<void> {
        console.log('[PostSubmitter] Preparing to submit...')
        this.progress('Checking for CAPTCHA...')

        // ── Pre-flight: CAPTCHA check ─────────────────────
        await this.detectCaptcha()

        // ── Pre-flight: violation check ───────────────────
        await this.checkViolations()

        // ── Click Post button ─────────────────────────────
        this.progress('Clicking Post button...')
        await DebugHelper.dumpPageState(this.page, 'before_post')

        for (let attempt = 1; attempt <= 5; attempt++) {
            this.progress(`Searching for Post button (attempt ${attempt}/5)...`)

            const clicked = await this.clickPostButton()
            if (clicked) {
                await this.handleConfirmDialog()
                await DebugHelper.dumpPageState(this.page, 'after_post')
                return
            }

            // Scroll down to reveal button
            await this.page.evaluate(() => {
                document.documentElement.scrollTop = document.documentElement.scrollHeight
            }).catch(() => {})
            await this.page.waitForTimeout(2000)
        }

        /** @throws DG-112 — Post button not found after 5 attempts */
        throw new CodedError('DG-112', 'Could not find or click Post button — debug artifacts saved')
    }

    // ── Click Post via data-e2e ──────────────────────────

    private async clickPostButton(): Promise<boolean> {
        // Priority 1: data-e2e selector
        const primary = this.page.locator(TIKTOK_SELECTORS.POST.BUTTON)
        try {
            if (await primary.isVisible({ timeout: 3000 })) {
                await primary.scrollIntoViewIfNeeded()
                await primary.click()
                console.log('[PostSubmitter] Clicked via data-e2e selector')
                return true
            }
        } catch {}

        // Priority 2: fallback scoring on visible buttons
        const buttons = this.page.locator('button, div[role="button"]')
        const count = await buttons.count()

        for (let j = 0; j < count; j++) {
            const btn = buttons.nth(j)
            if (!await btn.isVisible()) continue

            const text = (await btn.innerText().catch(() => '')).trim()
            if (text === 'Post' || text === 'Đăng') {
                try {
                    await btn.scrollIntoViewIfNeeded()
                    await btn.click()
                    console.log(`[PostSubmitter] Clicked via text match: "${text}"`)
                    return true
                } catch {}
            }
        }

        return false
    }

    // ── CAPTCHA detection ────────────────────────────────

    private async detectCaptcha(): Promise<void> {
        for (const sel of TIKTOK_SELECTORS.CAPTCHA.INDICATORS) {
            try {
                const el = this.page.locator(sel).first()
                if (await el.isVisible({ timeout: 2000 })) {
                    await DebugHelper.dumpPageState(this.page, 'captcha_detected')
                    /** @throws DG-113 — CAPTCHA detected during post submission */
                    throw new CodedError('DG-113', 'CAPTCHA_DETECTED: TikTok requires CAPTCHA verification')
                }
            } catch (e: any) {
                if (e.message.includes('CAPTCHA_DETECTED')) throw e
            }
        }
    }

    // ── Violation check ──────────────────────────────────

    private async checkViolations(): Promise<void> {
        for (const sel of TIKTOK_SELECTORS.ERRORS.VIOLATION) {
            try {
                const el = this.page.locator(sel).first()
                if (await el.isVisible({ timeout: 2000 })) {
                    await DebugHelper.dumpPageState(this.page, 'violation_detected')
                    /** @throws DG-114 — TikTok flagged content violation */
                    throw new CodedError('DG-114', 'VIOLATION_DETECTED: TikTok detected content violation during upload')
                }
            } catch (e: any) {
                if (e.message.includes('_DETECTED')) throw e
            }
        }
    }

    // ── Confirm dialog ───────────────────────────────────

    private async handleConfirmDialog(): Promise<void> {
        console.log('[PostSubmitter] Checking for confirmation dialog...')
        await this.page.waitForTimeout(2000)

        for (const sel of TIKTOK_SELECTORS.POST.CONFIRM_BUTTONS) {
            try {
                const btn = this.page.locator(sel).first()
                if (await btn.isVisible({ timeout: 1000 })) {
                    console.log(`[PostSubmitter] Confirming with: ${sel}`)
                    await btn.click()
                    await this.page.waitForTimeout(2000)
                    return
                }
            } catch {}
        }

        // Fallback: score visible dialog buttons by text for locale-specific confirms.
        try {
            const dialogButtons = this.page.locator('div[role="dialog"] button, div[role="dialog"] div[role="button"]')
            const count = await dialogButtons.count()
            const positiveTexts = ['post', 'post now', 'publish', 'đăng', '今すぐ投稿']
            const negativeTexts = ['cancel', 'hủy', 'キャンセル', 'back']

            for (let i = 0; i < count; i++) {
                const btn = dialogButtons.nth(i)
                if (!await btn.isVisible().catch(() => false)) continue
                const text = ((await btn.innerText().catch(() => '')) || '').trim().toLowerCase()
                if (!text) continue
                if (negativeTexts.some(t => text.includes(t))) continue
                if (!positiveTexts.some(t => text.includes(t))) continue

                console.log(`[PostSubmitter] Confirming via fallback text: "${text}"`)
                await btn.click().catch(() => {})
                await this.page.waitForTimeout(2000)
                return
            }
        } catch {}
    }

    private progress(msg: string) {
        if (this.onProgress) this.onProgress(msg)
    }
}

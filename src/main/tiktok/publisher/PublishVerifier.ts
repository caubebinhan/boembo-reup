import { Page, Response } from 'playwright-core'
import { TIKTOK_SELECTORS } from './constants/selectors'
import { PublishResult } from './types'
import { DebugHelper } from './helpers/DebugHelper'

// ── Post verification via TikTok Content Dashboard ──────────────────────────

interface VerifyOptions {
    useUniqueTag: boolean
    uniqueTag: string
    uploadStartTime: number
    username?: string
    onProgress?: (msg: string) => void
}

export class PublishVerifier {
    constructor(private page: Page) {}

    async verify(opts: VerifyOptions): Promise<PublishResult> {
        console.log('[PublishVerifier] Verifying publication...')
        if (opts.onProgress) opts.onProgress('Verifying publication...')

        const indicator = await this.waitForSuccessIndicator()

        // If waitForSuccessIndicator returned a PublishResult (violation), bubble it up
        if (indicator !== true) return indicator as PublishResult

        // Navigate to Content Dashboard for strict verification
        return this.verifyViaDashboard(opts)
    }

    // ── Wait for success or violation ────────────────────

    private async waitForSuccessIndicator(): Promise<PublishResult | true> {
        for (let i = 0; i < 120; i++) {
            if (this.page.isClosed()) throw new Error('Browser page closed during verification')
            try { await this.page.waitForTimeout(1000) } catch { break }

            // Still uploading?
            const uploading = await this.page.$('text="Your video is being uploaded"')
                ?? await this.page.$('text="Video của bạn đang được tải lên"')
            if (uploading && await uploading.isVisible().catch(() => false)) continue

            // CAPTCHA check during verification
            for (const sel of TIKTOK_SELECTORS.CAPTCHA.INDICATORS) {
                const captcha = await this.page.$(sel).catch(() => null)
                if (captcha && await captcha.isVisible().catch(() => false)) {
                    await DebugHelper.dumpPageState(this.page, 'captcha_during_verify')
                    return { success: false, errorType: 'captcha', error: 'CAPTCHA_DETECTED: Captcha required during verification' }
                }
            }

            // Success indicators (data-e2e first)
            for (const sel of TIKTOK_SELECTORS.SUCCESS.INDICATORS) {
                if (await this.page.$(sel).catch(() => null)) {
                    console.log(`[PublishVerifier] Success indicator: ${sel}`)
                    return true
                }
            }

            // Check visible modal dialogs for violations
            const modalResult = await this.checkModalDialogs()
            if (modalResult !== null) return modalResult
        }

        // Timeout
        await DebugHelper.dumpPageState(this.page, 'verify_timeout')
        return { success: false, errorType: 'unknown', error: 'Upload timed out — success message not found' }
    }

    // ── Modal dialog check ───────────────────────────────

    private async checkModalDialogs(): Promise<PublishResult | null> {
        try {
            const dialogs = this.page.locator('div[role="dialog"], div[class*="TUXModal"]')
            const count = await dialogs.count()

            for (let d = 0; d < count; d++) {
                const dialog = dialogs.nth(d)
                if (!await dialog.isVisible()) continue

                const text = ((await dialog.innerText()) || '').replace(/\n+/g, ' ').trim()

                // Check success keywords
                const successKeywords = ['Manage your posts', 'View Profile', 'Upload complete', 'Quản lý bài đăng']
                if (successKeywords.some(kw => text.includes(kw))) return null // not violation — continue

                // Non-trivial dialog content = potential violation
                if (text.length > 10) {
                    const artifacts = await DebugHelper.dumpPageState(this.page, 'violation_modal')
                    return {
                        success: false,
                        errorType: 'violation',
                        error: `TikTok Violation: ${text.substring(0, 200)}`,
                        debugArtifacts: artifacts,
                    }
                }
            }
        } catch {}
        return null
    }

    // ── Dashboard verification ───────────────────────────

    private async verifyViaDashboard(opts: VerifyOptions): Promise<PublishResult> {
        console.log('[PublishVerifier] Navigating to Content Dashboard...')
        if (opts.onProgress) opts.onProgress('Checking video status on dashboard...')

        try {
            let apiData: any = null

            const handler = async (response: Response) => {
                try {
                    if (response.url().includes('tiktokstudio/content/list')) {
                        const json = await response.json()
                        if (json?.data?.post_list) apiData = json.data.post_list
                    }
                } catch {}
            }

            this.page.on('response', handler)
            await this.page.goto('https://www.tiktok.com/tiktokstudio/content', { waitUntil: 'domcontentloaded' })

            for (let check = 1; check <= 5; check++) {
                if (this.page.isClosed()) break
                await this.page.waitForTimeout(5000).catch(() => {})

                // ── API data match ──────────────────────
                if (apiData?.length > 0) {
                    const now = Math.floor(Date.now() / 1000)
                    const match = apiData.find((v: any) => {
                        if (opts.useUniqueTag && v.desc?.includes(opts.uniqueTag)) return true
                        return parseInt(v.create_time) >= (now - 900)
                    }) || apiData[0]

                    if (match) {
                        this.page.off('response', handler)
                        const uname = opts.username || 'user'
                        const finalUrl = `https://www.tiktok.com/@${uname}/video/${match.item_id}`
                        return { success: true, videoId: match.item_id, videoUrl: finalUrl, isReviewing: match.privacy_level !== 1 }
                    }
                }

                // ── UI table match ──────────────────────
                const uiStatus = await this.page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('div[data-e2e="recent-post-item"], tr'))
                    if (rows.length > 0) {
                        const row = rows[0] as HTMLElement
                        const linkEl = row.querySelector('a[href*="/video/"]')
                        const href = linkEl?.getAttribute('href')
                        const idMatch = href?.match(/\/video\/(\d+)/)
                        const text = row.innerText
                        const isReviewing = text.includes('Under review') || text.includes('Đang xét duyệt')
                        return { id: idMatch?.[1] ?? null, url: href, isReviewing }
                    }
                    return null
                })

                if (uiStatus?.id) {
                    this.page.off('response', handler)
                    return { success: true, videoId: uiStatus.id, videoUrl: uiStatus.url || undefined, isReviewing: uiStatus.isReviewing }
                }
            }

            this.page.off('response', handler)
        } catch (e) {
            console.error('[PublishVerifier] Dashboard check error:', e)
        }

        return { success: true, warning: 'Verification incomplete — check dashboard manually', isReviewing: true }
    }
}

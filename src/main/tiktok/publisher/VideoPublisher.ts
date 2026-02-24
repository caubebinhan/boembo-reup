import { Page } from 'playwright-core'
import { browserService } from '../../services/BrowserService'
import * as Sentry from '@sentry/electron/main'
import { sanitizeCookies } from './helpers/CookieHelper'
import { FileUploader } from './FileUploader'
import { CaptionSetter } from './CaptionSetter'
import { PostSubmitter } from './PostSubmitter'
import { PublishVerifier } from './PublishVerifier'
import { PublishOptions, PublishResult, PublishErrorType } from './types'
import { DebugHelper } from './helpers/DebugHelper'
import { OverlayHelper } from './helpers/OverlayHelper'

// ── VideoPublisher: orchestrates the full TikTok upload flow ─────────────────

export class VideoPublisher {
    async publish(
        filePath: string,
        caption: string,
        cookies: any[],
        onProgress?: (msg: string) => void,
        options?: PublishOptions
    ): Promise<PublishResult> {
        const useUniqueTag = options?.advancedVerification || false
        const uniqueTag = '#' + Math.random().toString(36).substring(2, 8)
        const finalCaption = useUniqueTag ? `${caption} ${uniqueTag}` : caption

        console.log(`[VideoPublisher] Starting publish:`)
        console.log(`  File: ${filePath}`)
        console.log(`  Tag: ${useUniqueTag ? uniqueTag : 'disabled'}`)

        if (onProgress) onProgress('Initializing browser...')

        let page: Page | null = null
        const uploadStartTime = Math.floor(Date.now() / 1000)

        try {
            // ── Init browser ──────────────────────────────
            await browserService.init(false)
            page = await browserService.newPage()
            if (!page) throw new Error('Failed to create page')

            // ── Inject cookies ────────────────────────────
            if (!cookies?.length) {
                return this.fail('No cookies provided. Please re-login the publish account.', 'session_expired')
            }
            try {
                await page.context().addCookies(sanitizeCookies(cookies))
                console.log(`[VideoPublisher] Injected ${cookies.length} cookies`)
            } catch (e) {
                console.error('[VideoPublisher] Cookie injection failed:', e)
            }

            // ── Navigate to TikTok Studio ─────────────────
            if (onProgress) onProgress('Navigating to upload page...')
            try {
                await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp', {
                    waitUntil: 'domcontentloaded', timeout: 60000
                })
            } catch (e: any) {
                if (!e.message.includes('interrupted by another navigation')) throw e
            }
            await page.waitForTimeout(3000)

            if (page.url().includes('/login')) {
                return this.fail('Session expired: redirected to login. Please re-login.', 'session_expired')
            }

            // ── Upload file ───────────────────────────────
            const uploader = new FileUploader(page, onProgress)
            await uploader.upload(filePath)

            if (page.isClosed()) throw new Error('Browser closed unexpectedly before posting')
            await page.waitForTimeout(1000)

            // ── Set caption ───────────────────────────────
            const captionSetter = new CaptionSetter(page, onProgress)
            await captionSetter.setCaption(finalCaption)

            if (page.isClosed()) throw new Error('Browser closed unexpectedly before posting')

            // ── Clean overlays before submit ──────────────
            if (onProgress) onProgress('Cleaning overlays...')
            const overlayHelper = new OverlayHelper(page, onProgress)
            await overlayHelper.clean()

            // ── Submit post ───────────────────────────────
            const submitter = new PostSubmitter(page, onProgress)
            await submitter.submit()

            // ── Verify ────────────────────────────────────
            const verifier = new PublishVerifier(page)
            return await verifier.verify({
                useUniqueTag, uniqueTag, uploadStartTime,
                username: options?.username, onProgress,
            })

        } catch (error: any) {
            Sentry.captureException(error, { tags: { module: 'tiktok', operation: 'publishVideo' } })
            console.error('[VideoPublisher] Publish failed:', error)

            const errorType = this.classifyError(error.message)
            let debugArtifacts: PublishResult['debugArtifacts']

            if (page && !page.isClosed()) {
                try { debugArtifacts = await DebugHelper.dumpPageState(page, `publish_error_${errorType}`) } catch {}
            }

            return { success: false, error: error.message || String(error), errorType, debugArtifacts }
        } finally {
            if (page) await page.close()
        }
    }

    // ── Error classification ─────────────────────────────

    private classifyError(message: string): PublishErrorType {
        const msg = (message || '').toLowerCase()
        if (msg.includes('captcha')) return 'captcha'
        if (msg.includes('violation') || msg.includes('restricted') || msg.includes('copyright')) return 'violation'
        if (msg.includes('login') || msg.includes('session') || msg.includes('expired')) return 'session_expired'
        if (msg.includes('upload') || msg.includes('file input')) return 'upload_failed'
        return 'unknown'
    }

    private fail(error: string, errorType: PublishErrorType): PublishResult {
        return { success: false, error, errorType }
    }
}

import { Page } from 'playwright-core'
import { browserService } from '../../services/BrowserService'
import { SentryMain as Sentry } from '../../sentry'
import { sanitizeCookies } from './helpers/CookieHelper'
import { FileUploader } from './FileUploader'
import { CaptionSetter } from './CaptionSetter'
import { PostSubmitter } from './PostSubmitter'
import { PublishVerifier } from './PublishVerifier'
import { PublishOptions, PublishResult, PublishErrorType } from './types'
import { DebugHelper, PublishDebugRecorder } from './helpers/DebugHelper'
import { OverlayHelper } from './helpers/OverlayHelper'
import fs from 'fs-extra'
import path from 'path'

// ── VideoPublisher: orchestrates the full TikTok upload flow ─────────────────

export class VideoPublisher {
    private static uiDriftReportCache = new Map<string, number>()
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
        let recorder: PublishDebugRecorder | null = null
        const uploadStartTime = Math.floor(Date.now() / 1000)
        const includeCookieValues = process.env.TIKTOK_DEBUG_INCLUDE_COOKIE_VALUES === '1'
        let cookieInputSnapshot: string | undefined
        let cookieSnapshot: string | undefined
        let videoMetadata: string | undefined
        let currentStage = 'init_browser'

        try {
            // ── Init browser ──────────────────────────────
            currentStage = 'init_browser'
            await browserService.init(false)
            page = await browserService.newPage()
            if (!page) throw new Error('Failed to create page')
            recorder = new PublishDebugRecorder(page, 'tiktok_publish')
            recorder.attach()
            recorder.record('publish_start', {
                filePath,
                captionLength: finalCaption.length,
                username: options?.username,
                useUniqueTag,
            })
            videoMetadata = await DebugHelper.dumpFileMetadata(filePath, 'publish_video_metadata')
            cookieInputSnapshot = await DebugHelper.dumpCookieInput(cookies, 'publish_cookie_input', includeCookieValues)

            // ── Inject cookies ────────────────────────────
            if (!cookies?.length) {
                const result = this.fail('No cookies provided. Please re-login the publish account.', 'session_expired')
                const finalized = recorder ? await recorder.finalize('no_cookies').catch(() => null) : null
                result.debugArtifacts = {
                    sessionLog: finalized?.sessionLog,
                    checkpoints: finalized?.checkpoints,
                    cookieInputSnapshot,
                    videoMetadata,
                }
                return result
            }
            try {
                currentStage = 'cookie_injection'
                await page.context().addCookies(sanitizeCookies(cookies))
                console.log(`[VideoPublisher] Injected ${cookies.length} cookies`)
                cookieSnapshot = await DebugHelper.dumpCookieSnapshot(page, 'publish_context_cookies', includeCookieValues)
                recorder.record('cookies_injected', { count: cookies.length })
            } catch (e) {
                console.error('[VideoPublisher] Cookie injection failed:', e)
                recorder.record('cookie_injection_failed', { error: (e as any)?.message || String(e) })
            }

            // ── Navigate to TikTok Studio ─────────────────
            if (onProgress) onProgress('Navigating to upload page...')
            try {
                currentStage = 'navigate_upload_page'
                await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp', {
                    waitUntil: 'domcontentloaded', timeout: 60000
                })
            } catch (e: any) {
                if (!e.message.includes('interrupted by another navigation')) throw e
            }
            await page.waitForTimeout(3000)
            await recorder?.checkpoint('after_navigate_upload')

            if (page.url().includes('/login')) {
                await recorder?.checkpoint('redirected_login')
                const result = this.fail('Session expired: redirected to login. Please re-login.', 'session_expired')
                const finalized = recorder ? await recorder.finalize('redirect_login').catch(() => null) : null
                result.debugArtifacts = {
                    sessionLog: finalized?.sessionLog,
                    checkpoints: finalized?.checkpoints,
                    cookieInputSnapshot,
                    cookieSnapshot,
                    videoMetadata,
                }
                return result
            }

            // ── Upload file ───────────────────────────────
            const uploader = new FileUploader(page, onProgress)
            currentStage = 'file_upload'
            await uploader.upload(filePath)
            await recorder?.checkpoint('after_upload')

            if (page.isClosed()) throw new Error('Browser closed unexpectedly before posting')
            await page.waitForTimeout(1000)

            // ── Clean overlays before caption (joyride blocks editor) ──
            const overlayHelper = new OverlayHelper(page, onProgress)
            currentStage = 'overlay_cleanup_before_caption'
            await overlayHelper.clean()

            // ── Set caption ───────────────────────────────
            const captionSetter = new CaptionSetter(page, onProgress)
            currentStage = 'caption_input'
            await captionSetter.setCaption(finalCaption)
            await recorder?.checkpoint('after_caption')

            if (page.isClosed()) throw new Error('Browser closed unexpectedly before posting')

            // ── Clean overlays again before submit ──────────
            if (onProgress) onProgress('Cleaning overlays...')
            currentStage = 'overlay_cleanup_before_submit'
            await overlayHelper.clean()
            await recorder?.checkpoint('before_submit')

            // ── Submit post ───────────────────────────────
            const submitter = new PostSubmitter(page, onProgress)
            currentStage = 'submit_post'
            await submitter.submit()
            await recorder?.checkpoint('after_submit')

            // ── Verify ────────────────────────────────────
            const verifier = new PublishVerifier(page)
            currentStage = 'verify_publish'
            const verifyResult = await verifier.verify({
                useUniqueTag, uniqueTag, uploadStartTime,
                expectedCaption: finalCaption,
                username: options?.username, onProgress,
            })
            const verifyCheckpointLabel = !verifyResult.success
                ? 'verify_failed'
                : verifyResult.publishStatus === 'verification_incomplete'
                    ? 'verify_incomplete'
                    : 'verify_success'
            await recorder?.checkpoint(verifyCheckpointLabel)
            const recorderArtifacts = recorder
                ? await recorder.finalize(verifyResult.success ? 'success' : 'failed')
                : null
            verifyResult.debugArtifacts = {
                ...verifyResult.debugArtifacts,
                sessionLog: recorderArtifacts?.sessionLog,
                checkpoints: [
                    ...(verifyResult.debugArtifacts?.checkpoints || []),
                    ...(recorderArtifacts?.checkpoints || []),
                ],
                cookieInputSnapshot,
                cookieSnapshot,
                videoMetadata,
            }
            return verifyResult

        } catch (error: any) {
            Sentry.captureException(error, {
                tags: { module: 'tiktok', operation: 'publishVideo', stage: currentStage },
                extra: { publish_stage: currentStage },
            })
            console.error('[VideoPublisher] Publish failed:', error)

            const errorType = this.classifyError(error.message)
            let debugArtifacts: PublishResult['debugArtifacts']

            if (page && !page.isClosed()) {
                try {
                    const pageDump = await DebugHelper.dumpPageState(page, `publish_error_${errorType}`)
                    debugArtifacts = {
                        ...pageDump,
                        cookieInputSnapshot,
                        cookieSnapshot,
                        videoMetadata,
                    }
                    if (recorder) {
                        const checkpoint = await recorder.checkpoint(`error_${errorType}`).catch(() => null)
                        const finalized = await recorder.finalize(`error_${errorType}`).catch(() => null)
                        if (checkpoint) {
                            debugArtifacts.checkpoints = [
                                ...(debugArtifacts.checkpoints || []),
                                checkpoint.screenshot,
                                checkpoint.html,
                                checkpoint.signals,
                            ]
                        }
                        if (finalized) {
                            debugArtifacts.sessionLog = finalized.sessionLog
                            debugArtifacts.checkpoints = [
                                ...(debugArtifacts.checkpoints || []),
                                ...finalized.checkpoints,
                            ]
                        }
                    }
                } catch {}
            } else if (recorder) {
                try {
                    const finalized = await recorder.finalize(`error_${errorType}`)
                    debugArtifacts = {
                        sessionLog: finalized.sessionLog,
                        checkpoints: finalized.checkpoints,
                        cookieInputSnapshot,
                        cookieSnapshot,
                        videoMetadata,
                    }
                } catch {}
            }

            await this.reportPotentialUiDriftToSentry(error, errorType, debugArtifacts, currentStage)

            return { success: false, error: error.message || String(error), errorType, debugArtifacts }
        } finally {
            if (page) await page.close()
        }
    }

    async recheckPublishedStatus(
        cookies: any[],
        onProgress?: (msg: string) => void,
        options?: PublishOptions & {
            useUniqueTag?: boolean
            uniqueTag?: string
            uploadStartTime?: number
            expectedVideoId?: string
            expectedVideoUrl?: string
            expectedCaption?: string
        }
    ): Promise<PublishResult> {
        let page: Page | null = null
        try {
            await browserService.init(false)
            page = await browserService.newPage()
            if (!page) throw new Error('Failed to create page for publish recheck')
            await page.context().addCookies(sanitizeCookies(cookies || []))
            const verifier = new PublishVerifier(page)
            return await verifier.recheckDashboardStatus({
                useUniqueTag: !!options?.useUniqueTag,
                uniqueTag: options?.uniqueTag || '',
                uploadStartTime: options?.uploadStartTime || Math.floor(Date.now() / 1000),
                username: options?.username,
                expectedVideoId: options?.expectedVideoId,
                expectedVideoUrl: options?.expectedVideoUrl,
                expectedCaption: options?.expectedCaption,
                onProgress,
            })
        } catch (error: any) {
            const message = error?.message || String(error)
            return { success: false, error: message, errorType: this.classifyError(message) }
        } finally {
            if (page) await page.close().catch(() => {})
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

    private async reportPotentialUiDriftToSentry(
        error: any,
        errorType: PublishErrorType,
        debugArtifacts?: PublishResult['debugArtifacts'],
        stage?: string
    ): Promise<void> {
        try {
            const message = String(error?.message || error || '')
            const lower = message.toLowerCase()
            const selectorLike =
                lower.includes('timeout') ||
                lower.includes('selector') ||
                lower.includes('locator') ||
                lower.includes('not found') ||
                lower.includes('click') ||
                lower.includes('upload') ||
                lower.includes('button')

            if (!selectorLike && !['upload_failed', 'unknown'].includes(errorType)) return

            const cacheKey = `${stage || 'unknown'}:${errorType}:${message.slice(0, 120)}`
            const now = Date.now()
            const last = VideoPublisher.uiDriftReportCache.get(cacheKey) || 0
            if (now - last < 10 * 60 * 1000) return
            VideoPublisher.uiDriftReportCache.set(cacheKey, now)

            const attachments: any[] = []
            for (const spec of [
                { filePath: debugArtifacts?.screenshot, contentType: 'image/png', asText: false, maxBytes: 1024 * 1024 },
                { filePath: debugArtifacts?.html, contentType: 'text/html; charset=utf-8', asText: true, maxBytes: 512 * 1024 },
                { filePath: debugArtifacts?.sessionLog, contentType: 'application/json', asText: true, maxBytes: 512 * 1024 },
            ]) {
                const attachment = await this.buildSentryAttachment(spec.filePath, spec.contentType, spec.asText, spec.maxBytes)
                if (attachment) attachments.push(attachment)
            }

            Sentry.withScope(scope => {
                scope.setLevel('warning')
                scope.setTag('module', 'tiktok')
                scope.setTag('operation', 'publishVideo')
                scope.setTag('issue_type', 'ui_selector_drift_suspected')
                scope.setTag('error_type', errorType)
                scope.setTag('stage', stage || 'unknown')
                scope.setExtra('error_message', message)
                scope.setExtra('publish_stage', stage || 'unknown')
                scope.setExtra('screenshot_path', debugArtifacts?.screenshot || '')
                scope.setExtra('html_path', debugArtifacts?.html || '')
                scope.setExtra('session_log_path', debugArtifacts?.sessionLog || '')
                scope.setContext('publish_ui_failure', {
                    errorType,
                    stage: stage || 'unknown',
                    message: message.slice(0, 1000),
                    selectorLike,
                } as any)
                for (const attachment of attachments) {
                    try { scope.addAttachment(attachment) } catch {}
                }
                Sentry.captureMessage(`[TikTok][VideoPublisher] UI selector/indicator drift suspected (${stage || 'unknown'})`)
            })
        } catch (reportErr) {
            console.warn('[VideoPublisher] Failed to report UI drift to Sentry:', reportErr)
        }
    }

    private async buildSentryAttachment(
        filePath?: string,
        contentType?: string,
        asText = false,
        maxBytes = 1024 * 1024
    ): Promise<any | null> {
        if (!filePath) return null
        try {
            const exists = await fs.pathExists(filePath)
            if (!exists) return null
            if (asText) {
                const text = await fs.readFile(filePath, 'utf8')
                const clipped = text.length > maxBytes ? `${text.slice(0, maxBytes)}\n\n/* truncated */` : text
                return {
                    filename: path.basename(filePath),
                    data: clipped,
                    contentType,
                }
            }
            let buf = await fs.readFile(filePath)
            if (buf.length > maxBytes) buf = buf.subarray(0, maxBytes)
            return {
                filename: path.basename(filePath),
                data: new Uint8Array(buf),
                contentType,
            }
        } catch {
            return null
        }
    }
}

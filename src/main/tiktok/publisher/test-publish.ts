/**
 * Test script: navigates to TikTok Studio, dumps HTML, discovers data-e2e attributes.
 *
 * Usage (from Electron main process):
 *   import { runPublishTest } from './test-publish'
 *   runPublishTest()
 *
 * This is NOT a standalone Node.js script - it requires Electron's app context
 * for cookie access and the BrowserService.
 */

import { accountRepo } from '../../db/repositories/AccountRepo'
import { campaignRepo } from '../../db/repositories/CampaignRepo'
import { browserService } from '../../services/BrowserService'
import { sanitizeCookies } from './helpers/CookieHelper'
import { DebugHelper } from './helpers/DebugHelper'
import { VideoPublisher } from './VideoPublisher'
import { Page } from 'playwright-core'

export type TroubleshootingLogger = (line: string, meta?: { level?: 'info' | 'warn' | 'error' }) => void

export interface TroubleshootingRunOptions {
    logger?: TroubleshootingLogger
    accountId?: string
    videoLocalPath?: string
    videoPlatformId?: string
    videoCampaignId?: string
    randomSeed?: string | number
}

export interface TroubleshootingRunResult {
    success: boolean
    summary: string
    accountUsername?: string
    videoPath?: string
    result?: any
    artifacts?: any
}

function createLogger(logger?: TroubleshootingLogger) {
    return {
        info: (msg: string) => {
            console.log(msg)
            logger?.(msg, { level: 'info' })
        },
        warn: (msg: string) => {
            console.warn(msg)
            logger?.(msg, { level: 'warn' })
        },
        error: (msg: string) => {
            console.error(msg)
            logger?.(msg, { level: 'error' })
        },
    }
}

function resolveTiktokAccount(
    opts: TroubleshootingRunOptions | undefined,
    mode: 'first' | 'firstWithCookies',
    log?: ReturnType<typeof createLogger>
): { account: any | null; error?: string } {
    const accounts = accountRepo.findByPlatform('tiktok')
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return { account: null, error: 'No publish accounts found. Please add one first.' }
    }

    const selectedId = opts?.accountId?.trim()
    if (selectedId) {
        const selected = accounts.find(a => a.id === selectedId)
        if (!selected) {
            return { account: null, error: `Selected account not found: ${selectedId}` }
        }
        log?.info(`Using selected account from debug panel: @${selected.username} (${selected.id})`)
        return { account: selected }
    }

    const picked = mode === 'firstWithCookies'
        ? accounts.find(a => Array.isArray(a.cookies) && a.cookies.length > 0)
        : accounts[0]
    if (!picked) {
        return { account: null, error: 'No publish account with cookies found.' }
    }
    return { account: picked }
}

function seededIndex(seed: string | number, length: number): number {
    const text = String(seed)
    let hash = 2166136261 >>> 0
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619) >>> 0
    }
    return hash % Math.max(1, length)
}

function resolvePublishVideo(
    opts: TroubleshootingRunOptions | undefined,
    log?: ReturnType<typeof createLogger>
): { video: any | null; error?: string } {
    const selectedLocalPath = opts?.videoLocalPath?.trim()
    const selectedPlatformId = opts?.videoPlatformId?.trim()
    const selectedCampaignId = opts?.videoCampaignId?.trim()

    const allCampaigns = campaignRepo.findAll()

    // Explicit picker selection from debug panel
    if (selectedLocalPath || selectedPlatformId) {
        for (const doc of allCampaigns) {
            if (selectedCampaignId && doc.id !== selectedCampaignId) continue
            const store = campaignRepo.tryOpen(doc.id)
            if (!store) continue
            const found = store.videos.find(v => {
                if (!v?.local_path) return false
                const localMatch = selectedLocalPath ? v.local_path === selectedLocalPath : true
                const platformMatch = selectedPlatformId ? v.platform_id === selectedPlatformId : true
                return localMatch && platformMatch
            })
            if (found) {
                const video = { ...found, ...(found.data || {}) }
                log?.info(`Using selected video from debug panel: ${video.local_path} (${video.platform_id}) in campaign ${doc.name} (${doc.id})`)
                return { video }
            }
        }
        return {
            video: null,
            error: `Selected debug video not found in campaigns (campaignId=${selectedCampaignId || '-'}, platformId=${selectedPlatformId || '-'}, localPath=${selectedLocalPath || '-'})`,
        }
    }

    // Auto-pick fallback (current behavior)
    const eligible: any[] = []
    for (const doc of allCampaigns) {
        const store = campaignRepo.tryOpen(doc.id)
        if (!store) continue
        for (const v of store.videos) {
            if (!v?.local_path) continue
            if (!['downloaded', 'captioned', 'queued', 'processing'].includes(v.status)) continue
            eligible.push({
                ...v,
                ...(v.data || {}),
                _campaignId: doc.id,
                _campaignName: doc.name,
            })
        }
    }
    if (eligible.length > 0) {
        const hasSeed = opts?.randomSeed !== undefined && String(opts.randomSeed).trim() !== ''
        const idx = hasSeed
            ? seededIndex(String(opts?.randomSeed), eligible.length)
            : Math.floor(Math.random() * eligible.length)
        const chosen = eligible[idx]
        log?.info(`Auto-selected random debug video${hasSeed ? ` (seed=${String(opts?.randomSeed)})` : ''}: [${idx + 1}/${eligible.length}] ${chosen.local_path} (${chosen.platform_id}) from ${chosen._campaignName || chosen._campaignId}`)
        return { video: chosen }
    }
    return { video: null, error: 'No downloaded video found in any campaign.' }
}

export async function runPublishTest(opts?: TroubleshootingRunOptions): Promise<TroubleshootingRunResult> {
    const log = createLogger(opts?.logger)
    log.info('=== TikTok Studio Test ===')

    const { account, error } = resolveTiktokAccount(opts, 'first', log)
    if (!account) {
        const summary = error || 'No publish accounts found. Please add one first.'
        log.error(summary)
        return { success: false, summary }
    }

    const cookies = Array.isArray(account.cookies) ? account.cookies : null
    if (!cookies?.length) {
        const summary = `Account @${account.username} has no cookies.`
        log.error(summary)
        return { success: false, summary, accountUsername: account.username }
    }

    log.info(`Using account: @${account.username} (${cookies.length} cookies)`)

    let page: Page | null = null
    try {
        await browserService.init(false)
        page = await browserService.newPage()
        if (!page) throw new Error('Failed to create page')

        await page.context().addCookies(sanitizeCookies(cookies))
        log.info('Cookies injected.')

        log.info('Navigating to TikTok Studio upload page...')
        try {
            await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp', {
                waitUntil: 'domcontentloaded', timeout: 60000,
            })
        } catch (e: any) {
            if (!String(e?.message || e).includes('interrupted by another navigation')) throw e
        }
        await page.waitForTimeout(5000)

        log.info(`Current URL: ${page.url()}`)

        if (page.url().includes('/login')) {
            const summary = 'Redirected to login page - session expired.'
            log.error(summary)
            return { success: false, summary, accountUsername: account.username }
        }

        const artifacts = await DebugHelper.dumpPageState(page, 'studio_test')
        log.info(`HTML dumped to: ${artifacts.html}`)
        log.info(`Screenshot saved to: ${artifacts.screenshot}`)

        log.info('=== data-e2e Attributes Found ===')
        const dataE2E = await page.evaluate(() => {
            const elements = document.querySelectorAll('[data-e2e]')
            return Array.from(elements).map(el => ({
                e2e: el.getAttribute('data-e2e'),
                tag: el.tagName.toLowerCase(),
                text: (el as HTMLElement).innerText?.substring(0, 60)?.trim() || '',
                visible: (el as HTMLElement).offsetHeight > 0,
            }))
        })

        if (dataE2E.length === 0) {
            log.warn('(none found - page may not have loaded fully)')
        } else {
            for (const item of dataE2E) {
                const vis = item.visible ? 'VISIBLE' : 'HIDDEN'
                log.info(`[${vis}] [data-e2e="${item.e2e}"] <${item.tag}> "${item.text}"`)
            }
        }

        log.info('=== CAPTCHA Check ===')
        const captchaSelectors = [
            '[data-e2e="captcha-container"]', 'iframe[src*="captcha"]',
            '#captcha-container', '.captcha_verify_container', 'div[class*="captcha"]',
        ]
        for (const sel of captchaSelectors) {
            const found = await page.$(sel)
            log.info(`${found ? 'FOUND' : 'CLEAR'}: ${sel}`)
        }

        log.info('=== Visible Buttons ===')
        const buttons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button, div[role="button"]'))
                .filter(el => (el as HTMLElement).offsetHeight > 0)
                .map(el => ({
                    tag: el.tagName.toLowerCase(),
                    text: (el as HTMLElement).innerText?.substring(0, 60)?.trim() || '',
                    e2e: el.getAttribute('data-e2e') || '',
                }))
        })
        for (const b of buttons) {
            log.info(`<${b.tag}${b.e2e ? ` data-e2e="${b.e2e}"` : ''}> "${b.text}"`)
        }

        log.info('=== Test Complete ===')
        return {
            success: true,
            summary: `Studio smoke test passed (${dataE2E.length} data-e2e elements, ${buttons.length} visible buttons)` ,
            accountUsername: account.username,
            artifacts,
            result: {
                dataE2ECount: dataE2E.length,
                visibleButtons: buttons.length,
                currentUrl: page.url(),
            },
        }
    } catch (err: any) {
        const summary = `Studio smoke test failed: ${err?.message || String(err)}`
        log.error(summary)
        return { success: false, summary, accountUsername: account.username }
    } finally {
        if (page) await page.close().catch(() => {})
    }
}

/**
 * Full E2E publish test using:
 * - first saved publish account with cookies
 * - latest downloaded video from DB
 *
 * This will attempt a real TikTok publish.
 */
export async function runFullPublishE2ETest(opts?: TroubleshootingRunOptions): Promise<TroubleshootingRunResult> {
    const log = createLogger(opts?.logger)
    log.info('=== TikTok Full Publish E2E Test ===')

    // Find account with cookies from doc-store
    const { account, error } = resolveTiktokAccount(opts, 'firstWithCookies', log)
    if (!account) {
        const summary = error || 'No publish account with cookies found.'
        log.error(summary)
        return { success: false, summary }
    }

    // Find a downloaded video from any campaign
    const { video, error: videoError } = resolvePublishVideo(opts, log)
    if (!video?.local_path) {
        const summary = videoError || 'No downloaded video found in any campaign.'
        log.error(summary)
        return { success: false, summary, accountUsername: account.username }
    }

    const cookies = account.cookies
    if (!Array.isArray(cookies) || cookies.length === 0) {
        const summary = `Account @${account.username} has no cookies.`
        log.error(summary)
        return { success: false, summary, accountUsername: account.username, videoPath: video.local_path }
    }

    log.info(`Account: @${account.username}`)
    log.info(`Video: ${video.local_path}`)
    log.info(`Caption source: ${(video.generated_caption || video.description || '').slice(0, 80)}`)

    try {
        const publisher = new VideoPublisher()
        const result = await publisher.publish(
            video.local_path,
            video.generated_caption || video.description || '#test',
            cookies,
            (msg) => log.info(`[progress] ${msg}`),
            { username: account.username }
        )

        log.info('=== Publish Result ===')
        log.info(JSON.stringify(result, null, 2))

        if (result.debugArtifacts) {
            log.info('=== Debug Artifacts ===')
            log.info(`sessionLog: ${result.debugArtifacts.sessionLog || '(none)'}`)
            log.info(`cookieInputSnapshot: ${result.debugArtifacts.cookieInputSnapshot || '(none)'}`)
            log.info(`cookieSnapshot: ${result.debugArtifacts.cookieSnapshot || '(none)'}`)
            log.info(`videoMetadata: ${result.debugArtifacts.videoMetadata || '(none)'}`)
            log.info(`checkpoints: ${(result.debugArtifacts.checkpoints || []).length}`)
        }

        const isPublic = result.success && !result.isReviewing
        const summary = isPublic
            ? `Publish E2E success: public (${result.videoUrl || 'no-url'})`
            : result.success
                ? `Publish E2E partial: under review (${result.videoUrl || 'no-url'})`
                : `Publish E2E failed: ${result.error || 'unknown error'}`

        return {
            success: !!result.success,
            summary,
            accountUsername: account.username,
            videoPath: video.local_path,
            result,
            artifacts: result.debugArtifacts,
        }
    } catch (err: any) {
        const summary = `Publish E2E crashed: ${err?.message || String(err)}`
        log.error(summary)
        return { success: false, summary, accountUsername: account.username, videoPath: video.local_path }
    }
}

/**
 * Full publish + forced verification recheck debug.
 *
 * 1. Publishes a real video (same as runFullPublishE2ETest)
 * 2. Dumps ALL result flags (isReviewing, verificationIncomplete, etc.)
 * 3. Regardless of result, forces a recheckPublishedStatus and dumps that too
 * 4. Reports everything so we can diagnose why retry loop never triggers
 */
export async function debugDashboardVerify(opts?: TroubleshootingRunOptions): Promise<TroubleshootingRunResult> {
    const log = createLogger(opts?.logger)
    log.info('=== Dashboard Verify Debug (Full Publish + Forced Recheck) ===')

    // ── Find account ──────────────────────
    const { account, error } = resolveTiktokAccount(opts, 'firstWithCookies', log)
    if (!account) {
        return { success: false, summary: error || 'No account with cookies found.' }
    }
    const cookies = account.cookies
    log.info(`Account: @${account.username} (${cookies.length} cookies)`)

    // ── Find a video to publish ──────────────────────
    const { video, error: videoError } = resolvePublishVideo(opts, log)
    if (!video?.local_path) {
        return { success: false, summary: videoError || 'No downloaded video found in any campaign.', accountUsername: account.username }
    }

    const caption = video.generated_caption || video.description || '#debug_verify_test'
    log.info(`Video: ${video.local_path}`)
    log.info(`Caption: ${caption.slice(0, 80)}`)

    // ── Phase 1: Publish ──────────────────────
    log.info('')
    log.info('════════ PHASE 1: PUBLISH ════════')
    const publisher = new VideoPublisher()
    const publishStartedAt = Date.now()
    let publishResult: any

    try {
        publishResult = await publisher.publish(
            video.local_path,
            caption,
            cookies,
            (msg) => log.info(`[publish] ${msg}`),
            { username: account.username }
        )
    } catch (err: any) {
        log.error(`Publish crashed: ${err.message}`)
        return { success: false, summary: `Publish crashed: ${err.message}`, accountUsername: account.username }
    }

    // ── Phase 2: Dump ALL result flags ──────────────────────
    log.info('')
    log.info('════════ PHASE 2: PUBLISH RESULT FLAGS ════════')
    log.info(`success: ${publishResult.success}`)
    log.info(`isReviewing: ${publishResult.isReviewing}`)
    log.info(`verificationIncomplete: ${publishResult.verificationIncomplete}`)
    log.info(`publishStatus: ${publishResult.publishStatus}`)
    log.info(`videoId: ${publishResult.videoId}`)
    log.info(`videoUrl: ${publishResult.videoUrl}`)
    log.info(`error: ${publishResult.error || '(none)'}`)
    log.info(`errorType: ${publishResult.errorType || '(none)'}`)
    log.info(`warning: ${publishResult.warning || '(none)'}`)

    // Log which branch the publisher backend would take
    if (!publishResult.success) {
        log.warn('⚠️ Publish FAILED — backend would throw error, no retry')
    } else if (publishResult.verificationIncomplete || publishResult.publishStatus === 'verification_incomplete') {
        log.warn('⚠️ VERIFICATION INCOMPLETE — backend takes early return at line 164, SKIPS RETRY LOOP')
        log.warn('   This is the bug! The retry loop at line 187 only runs when isReviewing === true')
    } else if (publishResult.isReviewing) {
        log.info('✅ isReviewing=true — backend WOULD enter retry loop (lines 187-317)')
    } else {
        log.info('✅ Direct success — video is public, no retry needed')
    }

    if (!publishResult.success) {
        return {
            success: false,
            summary: `Publish failed: ${publishResult.error}. No recheck possible.`,
            accountUsername: account.username,
            result: publishResult,
        }
    }

    // ── Phase 3: Force recheck (regardless of flags) ──────────────────────
    log.info('')
    log.info('════════ PHASE 3: FORCED RECHECK (after 30s wait) ════════')
    log.info('Waiting 30 seconds before rechecking dashboard...')
    await new Promise(r => setTimeout(r, 30000))

    let recheckResult: any
    try {
        recheckResult = await publisher.recheckPublishedStatus(
            cookies,
            (msg) => log.info(`[recheck] ${msg}`),
            {
                username: account.username,
                uploadStartTime: Math.floor(publishStartedAt / 1000),
                expectedVideoId: publishResult.videoId,
                expectedVideoUrl: publishResult.videoUrl,
                expectedCaption: caption,
            }
        )
    } catch (err: any) {
        log.error(`Recheck crashed: ${err.message}`)
        recheckResult = { success: false, error: err.message }
    }

    // ── Phase 4: Dump recheck result ──────────────────────
    log.info('')
    log.info('════════ PHASE 4: RECHECK RESULT FLAGS ════════')
    log.info(`success: ${recheckResult.success}`)
    log.info(`isReviewing: ${recheckResult.isReviewing}`)
    log.info(`verificationIncomplete: ${recheckResult.verificationIncomplete}`)
    log.info(`publishStatus: ${recheckResult.publishStatus}`)
    log.info(`videoId: ${recheckResult.videoId}`)
    log.info(`videoUrl: ${recheckResult.videoUrl}`)
    log.info(`error: ${recheckResult.error || '(none)'}`)
    log.info(`warning: ${recheckResult.warning || '(none)'}`)

    if (recheckResult.isReviewing) {
        log.info('✅ Recheck says isReviewing=true — retry loop WOULD work if triggered')
    } else if (recheckResult.verificationIncomplete) {
        log.warn('⚠️ Recheck ALSO says verificationIncomplete — dashboard selectors may be broken')
    } else if (recheckResult.success && !recheckResult.isReviewing) {
        log.info('✅ Recheck says video is PUBLIC — no review needed')
    }

    // ── Summary ──────────────────────
    const totalTime = Math.round((Date.now() - publishStartedAt) / 1000)
    const summary = [
        `Publish: ${publishResult.success ? 'OK' : 'FAIL'}`,
        `verify=${publishResult.publishStatus || 'unknown'}`,
        `Recheck: ${recheckResult.success ? 'OK' : 'FAIL'}`,
        `recheck_status=${recheckResult.publishStatus || 'unknown'}`,
        `${totalTime}s total`,
    ].join(' | ')

    log.info('')
    log.info(`════════ SUMMARY: ${summary} ════════`)

    return {
        success: publishResult.success,
        summary,
        accountUsername: account.username,
        videoPath: video.local_path,
        result: {
            publishResult: {
                success: publishResult.success,
                isReviewing: publishResult.isReviewing,
                verificationIncomplete: publishResult.verificationIncomplete,
                publishStatus: publishResult.publishStatus,
                videoId: publishResult.videoId,
                videoUrl: publishResult.videoUrl,
                error: publishResult.error,
                warning: publishResult.warning,
            },
            recheckResult: {
                success: recheckResult.success,
                isReviewing: recheckResult.isReviewing,
                verificationIncomplete: recheckResult.verificationIncomplete,
                publishStatus: recheckResult.publishStatus,
                videoId: recheckResult.videoId,
                videoUrl: recheckResult.videoUrl,
                error: recheckResult.error,
                warning: recheckResult.warning,
            },
        },
    }
}

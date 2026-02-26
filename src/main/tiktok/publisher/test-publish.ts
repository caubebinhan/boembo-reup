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

export async function runPublishTest(opts?: TroubleshootingRunOptions): Promise<TroubleshootingRunResult> {
    const log = createLogger(opts?.logger)
    log.info('=== TikTok Studio Test ===')

    const accounts = accountRepo.findByPlatform('tiktok')
    const account = accounts[0]
    if (!account) {
        const summary = 'No publish accounts found. Please add one first.'
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
    const accounts = accountRepo.findByPlatform('tiktok')
    const account = accounts.find(a => Array.isArray(a.cookies) && a.cookies.length > 0)
    if (!account) {
        const summary = 'No publish account with cookies found.'
        log.error(summary)
        return { success: false, summary }
    }

    // Find a downloaded video from any campaign
    const allCampaigns = campaignRepo.findAll()
    let video: any = null
    for (const doc of allCampaigns) {
        const store = campaignRepo.tryOpen(doc.id)
        if (!store) continue
        const found = store.videos.find(v =>
            v.local_path && ['downloaded', 'captioned', 'queued', 'processing'].includes(v.status)
        )
        if (found) {
            video = { ...found, ...(found.data || {}) }
            break
        }
    }
    if (!video?.local_path) {
        const summary = 'No downloaded video found in any campaign.'
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

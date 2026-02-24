/**
 * Test script: navigates to TikTok Studio, dumps HTML, discovers data-e2e attributes.
 * 
 * Usage (from Electron main process):
 *   import { runPublishTest } from './test-publish'
 *   runPublishTest()
 * 
 * This is NOT a standalone Node.js script — it requires Electron's app context
 * for cookie access and the BrowserService.
 */

import { db } from '../../db/Database'
import { browserService } from '../../services/BrowserService'
import { sanitizeCookies } from './helpers/CookieHelper'
import { DebugHelper } from './helpers/DebugHelper'
import { Page } from 'playwright-core'

export async function runPublishTest() {
    console.log('=== TikTok Studio Test ===\n')

    // ── Get first publish account ────────────────────────
    const account = db.prepare('SELECT * FROM publish_accounts LIMIT 1').get() as any
    if (!account) {
        console.error('No publish accounts found. Please add one first.')
        return
    }

    const cookies = account.cookies_json ? JSON.parse(account.cookies_json) : null
    if (!cookies?.length) {
        console.error(`Account @${account.username} has no cookies.`)
        return
    }

    console.log(`Using account: @${account.username} (${cookies.length} cookies)`)

    let page: Page | null = null
    try {
        // ── Launch browser ───────────────────────────────
        await browserService.init(false)
        page = await browserService.newPage()
        if (!page) throw new Error('Failed to create page')

        await page.context().addCookies(sanitizeCookies(cookies))
        console.log('Cookies injected.')

        // ── Navigate to TikTok Studio ────────────────────
        console.log('\nNavigating to TikTok Studio upload page...')
        try {
            await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp', {
                waitUntil: 'domcontentloaded', timeout: 60000
            })
        } catch (e: any) {
            if (!e.message.includes('interrupted by another navigation')) throw e
        }
        await page.waitForTimeout(5000)

        console.log(`\nCurrent URL: ${page.url()}`)

        if (page.url().includes('/login')) {
            console.error('❌ Redirected to login page — session expired!')
            return
        }

        // ── Dump full HTML ───────────────────────────────
        const artifacts = await DebugHelper.dumpPageState(page, 'studio_test')
        console.log(`\n✅ HTML dumped to: ${artifacts.html}`)
        console.log(`✅ Screenshot saved to: ${artifacts.screenshot}`)

        // ── Discover data-e2e attributes ─────────────────
        console.log('\n=== data-e2e Attributes Found ===')
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
            console.log('  (none found — page may not have loaded fully)')
        } else {
            dataE2E.forEach(item => {
                const vis = item.visible ? '✅' : '👻'
                console.log(`  ${vis} [data-e2e="${item.e2e}"] <${item.tag}> "${item.text}"`)
            })
        }

        // ── Check for CAPTCHA ────────────────────────────
        console.log('\n=== CAPTCHA Check ===')
        const captchaSelectors = [
            '[data-e2e="captcha-container"]', 'iframe[src*="captcha"]',
            '#captcha-container', '.captcha_verify_container', 'div[class*="captcha"]',
        ]
        for (const sel of captchaSelectors) {
            const found = await page.$(sel)
            console.log(`  ${found ? '⚠️ FOUND' : '✓ Clear'}: ${sel}`)
        }

        // ── Check available buttons ──────────────────────
        console.log('\n=== Visible Buttons ===')
        const buttons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button, div[role="button"]'))
                .filter(el => (el as HTMLElement).offsetHeight > 0)
                .map(el => ({
                    tag: el.tagName.toLowerCase(),
                    text: (el as HTMLElement).innerText?.substring(0, 60)?.trim() || '',
                    e2e: el.getAttribute('data-e2e') || '',
                }))
        })
        buttons.forEach(b => {
            console.log(`  <${b.tag}${b.e2e ? ` data-e2e="${b.e2e}"` : ''}> "${b.text}"`)
        })

        console.log('\n=== Test Complete ===')

    } catch (err) {
        console.error('Test failed:', err)
    } finally {
        if (page) await page.close()
    }
}

import { Page } from 'playwright-core'
import path from 'node:path'
import fs from 'fs-extra'
import { app } from 'electron'

type RecorderEvent = {
    ts: string
    type: string
    data?: any
}

type RecorderHandlers = {
    console: (msg: any) => void
    pageerror: (err: any) => void
    requestfailed: (req: any) => void
    response: (res: any) => void
    dialog: (dialog: any) => void
    framenavigated: (frame: any) => void
}

export class DebugHelper {
    static getDebugDir(): string {
        return path.join(app.getPath('userData'), 'debug_artifacts')
    }

    static sanitizeLabel(label: string): string {
        return (label || 'debug').replace(/[^a-zA-Z0-9_-]+/g, '_')
    }

    static async dumpPageState(page: Page, label: string): Promise<{ screenshot: string; html: string }> {
        const ts = Date.now()
        const safeLabel = this.sanitizeLabel(label)
        // Dump to userData for reliability
        const debugDir = this.getDebugDir()
        await fs.ensureDir(debugDir)
        
        const screenshotPath = path.join(debugDir, `${safeLabel}_${ts}.png`)
        const htmlPath = path.join(debugDir, `${safeLabel}_${ts}.html`)
        
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true })
        } catch { }
        
        try {
            await fs.writeFile(htmlPath, await page.content())
        } catch { }

        console.log(`[DebugHelper] Dumped state '${label}' to ${debugDir}`)
        return { screenshot: screenshotPath, html: htmlPath }
    }

    static async dumpJson(label: string, payload: any): Promise<string> {
        const ts = Date.now()
        const debugDir = this.getDebugDir()
        await fs.ensureDir(debugDir)
        const filePath = path.join(debugDir, `${this.sanitizeLabel(label)}_${ts}.json`)
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
        return filePath
    }

    static async dumpCookieSnapshot(page: Page, label: string, includeValues = false): Promise<string> {
        const cookies = await page.context().cookies().catch(() => [])
        return this.dumpJson(label, {
            redacted: !includeValues,
            count: cookies.length,
            cookies: cookies.map((c: any) => ({
                name: c.name,
                domain: c.domain,
                path: c.path,
                expires: c.expires,
                httpOnly: c.httpOnly,
                secure: c.secure,
                sameSite: c.sameSite,
                value: includeValues ? c.value : undefined,
                valuePreview: includeValues ? undefined : ((c.value || '').slice(0, 4) + '***'),
            })),
        })
    }

    static async dumpCookieInput(cookies: any[], label: string, includeValues = false): Promise<string> {
        return this.dumpJson(label, {
            redacted: !includeValues,
            count: Array.isArray(cookies) ? cookies.length : 0,
            cookies: (cookies || []).map((c: any) => ({
                name: c?.name,
                domain: c?.domain,
                path: c?.path,
                expires: c?.expires,
                httpOnly: c?.httpOnly,
                secure: c?.secure,
                sameSite: c?.sameSite,
                value: includeValues ? c?.value : undefined,
                valuePreview: includeValues ? undefined : (((c?.value || '') as string).slice(0, 4) + '***'),
            })),
        })
    }

    static async dumpFileMetadata(filePath: string, label: string): Promise<string> {
        try {
            const stat = await fs.stat(filePath)
            return this.dumpJson(label, {
                path: filePath,
                name: path.basename(filePath),
                ext: path.extname(filePath),
                sizeBytes: stat.size,
                mtime: stat.mtime.toISOString(),
                ctime: stat.ctime.toISOString(),
                exists: true,
            })
        } catch (err: any) {
            return this.dumpJson(label, {
                path: filePath,
                exists: false,
                error: err?.message || String(err),
            })
        }
    }

    static async collectPageSignals(page: Page): Promise<any> {
        const url = page.url()
        const title = await page.title().catch(() => '')
        const signals = await page.evaluate(() => {
            const isVisible = (el: Element | null) => {
                if (!el) return false
                const h = el as HTMLElement
                const style = window.getComputedStyle(h)
                return !!(h.offsetWidth || h.offsetHeight || h.getClientRects().length) && style.visibility !== 'hidden' && style.display !== 'none'
            }

            const sample = (sel: string, limit = 8) =>
                Array.from(document.querySelectorAll(sel))
                    .filter(isVisible)
                    .slice(0, limit)
                    .map(el => ({
                        tag: el.tagName.toLowerCase(),
                        e2e: el.getAttribute('data-e2e'),
                        role: el.getAttribute('role'),
                        className: (el as HTMLElement).className,
                        text: ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
                    }))

            const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
            const warningKeywords = [
                'under review', 'processing', 'restricted', 'violation', 'copyright',
                'community guidelines', 'captcha', 'failed', 'couldn\'t upload', 'try again'
            ]
            const warningHits = warningKeywords.filter(k => bodyText.toLowerCase().includes(k))

            const videoLinks = Array.from(document.querySelectorAll('a[href*="/video/"]'))
                .slice(0, 10)
                .map(a => ({ href: a.getAttribute('href'), text: ((a as HTMLElement).innerText || '').trim().slice(0, 120) }))

            const dataE2EVisible = Array.from(document.querySelectorAll('[data-e2e]'))
                .filter(isVisible)
                .slice(0, 40)
                .map(el => ({
                    e2e: el.getAttribute('data-e2e'),
                    tag: el.tagName.toLowerCase(),
                    text: ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
                }))

            return {
                warningHits,
                toasts: sample('[role="alert"], [data-e2e="toast-message"], .tiktok-toast'),
                dialogs: sample('div[role="dialog"], div[class*="TUXModal"]'),
                buttons: sample('button, div[role="button"]', 20),
                videoLinks,
                dataE2EVisible,
            }
        }).catch(() => null)

        return { url, title, signals }
    }
}

export class PublishDebugRecorder {
    private events: RecorderEvent[] = []
    private handlers: RecorderHandlers | null = null
    private checkpointFiles: string[] = []

    constructor(private page: Page, private prefix = 'publish_session') {}

    record(type: string, data?: any) {
        this.events.push({
            ts: new Date().toISOString(),
            type,
            data,
        })
    }

    attach() {
        if (this.handlers) return
        this.handlers = {
            console: (msg: any) => this.record('console', {
                type: msg.type?.(),
                text: msg.text?.(),
            }),
            pageerror: (err: any) => this.record('pageerror', { message: err?.message || String(err) }),
            requestfailed: (req: any) => this.record('requestfailed', {
                url: req.url?.(),
                method: req.method?.(),
                failure: req.failure?.()?.errorText,
            }),
            response: async (res: any) => {
                try {
                    const url = res.url?.() || ''
                    if (!url.includes('tiktokstudio') && !url.includes('tiktok.com')) return
                    const status = res.status?.()
                    if (status >= 400) {
                        this.record('response_error', {
                            url,
                            status,
                            method: res.request?.()?.method?.(),
                        })
                    }
                } catch {}
            },
            dialog: (dialog: any) => {
                this.record('dialog', {
                    type: dialog.type?.(),
                    message: dialog.message?.(),
                })
                dialog.dismiss?.().catch?.(() => {})
            },
            framenavigated: (frame: any) => {
                if (frame === this.page.mainFrame()) {
                    this.record('navigated', { url: frame.url?.() })
                }
            },
        }

        this.page.on('console', this.handlers.console)
        this.page.on('pageerror', this.handlers.pageerror)
        this.page.on('requestfailed', this.handlers.requestfailed)
        this.page.on('response', this.handlers.response)
        this.page.on('dialog', this.handlers.dialog)
        this.page.on('framenavigated', this.handlers.framenavigated)
        this.record('recorder_attached')
    }

    async checkpoint(label: string) {
        const safe = `${this.prefix}_${label}`
        const pageDump = await DebugHelper.dumpPageState(this.page, safe)
        const signals = await DebugHelper.collectPageSignals(this.page)
        const signalsPath = await DebugHelper.dumpJson(`${safe}_signals`, signals)
        this.checkpointFiles.push(pageDump.screenshot, pageDump.html, signalsPath)
        this.record('checkpoint', { label, pageDump, signalsPath, url: this.page.url() })
        return { ...pageDump, signals: signalsPath }
    }

    async finalize(label = 'final'): Promise<{ sessionLog: string; checkpoints: string[] }> {
        this.record('finalize', { label, url: this.page.url?.() })
        if (this.handlers) {
            this.page.off('console', this.handlers.console)
            this.page.off('pageerror', this.handlers.pageerror)
            this.page.off('requestfailed', this.handlers.requestfailed)
            this.page.off('response', this.handlers.response)
            this.page.off('dialog', this.handlers.dialog)
            this.page.off('framenavigated', this.handlers.framenavigated)
            this.handlers = null
        }
        const sessionLog = await DebugHelper.dumpJson(`${this.prefix}_${label}_session`, { events: this.events })
        return { sessionLog, checkpoints: this.checkpointFiles.slice() }
    }
}

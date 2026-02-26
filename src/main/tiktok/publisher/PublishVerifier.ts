import { Page, Response } from 'playwright-core'
import { TIKTOK_SELECTORS } from './constants/selectors'
import { PublishResult } from './types'
import { DebugHelper } from './helpers/DebugHelper'
import { SentryMain as Sentry } from '../../sentry'
import fs from 'fs-extra'
import path from 'path'

interface VerifyOptions {
    useUniqueTag: boolean
    uniqueTag: string
    uploadStartTime: number
    username?: string
    expectedVideoId?: string
    expectedVideoUrl?: string
    expectedCaption?: string
    onProgress?: (msg: string) => void
}

export class PublishVerifier {
    private warnings = new Set<string>()
    private static indicatorDriftReportCache = new Map<string, number>()

    constructor(private page: Page) {}

    async verify(opts: VerifyOptions): Promise<PublishResult> {
        console.log('[PublishVerifier] Verifying publication...')
        opts.onProgress?.('Verifying publication...')
        this.warnings.clear()

        const indicator = await this.waitForSuccessIndicator()
        if (indicator !== true) {
            return this.withWarnings(indicator as PublishResult)
        }

        const result = await this.verifyViaDashboard(opts)
        return this.withWarnings(result)
    }

    async recheckDashboardStatus(opts: VerifyOptions): Promise<PublishResult> {
        console.log('[PublishVerifier] Rechecking dashboard status...')
        opts.onProgress?.('Rechecking dashboard status...')
        this.warnings.clear()
        const result = await this.verifyViaDashboard(opts)
        return this.withWarnings(result)
    }

    private withWarnings(result: PublishResult): PublishResult {
        if (this.warnings.size === 0) return result
        return {
            ...result,
            warning: [result.warning, ...this.warnings].filter(Boolean).join(' | '),
        }
    }

    private async waitForSuccessIndicator(): Promise<PublishResult | true> {
        for (let i = 0; i < 120; i++) {
            if (this.page.isClosed()) throw new Error('Browser page closed during verification')
            try { await this.page.waitForTimeout(1000) } catch { break }

            const uploading =
                await this.page.$('text=/your video is being uploaded|uploading/i').catch(() => null)
            if (uploading && await uploading.isVisible().catch(() => false)) {
                await this.captureWarningsFromPage()
                continue
            }

            for (const sel of TIKTOK_SELECTORS.CAPTCHA.INDICATORS) {
                const captcha = await this.page.$(sel).catch(() => null)
                if (captcha && await captcha.isVisible().catch(() => false)) {
                    const artifacts = await DebugHelper.dumpPageState(this.page, 'captcha_during_verify')
                    return {
                        success: false,
                        errorType: 'captcha',
                        error: 'CAPTCHA_DETECTED: Captcha required during verification',
                        debugArtifacts: artifacts,
                    }
                }
            }

            await this.captureWarningsFromPage()

            for (const sel of TIKTOK_SELECTORS.SUCCESS.INDICATORS) {
                if (await this.page.$(sel).catch(() => null)) {
                    console.log(`[PublishVerifier] Success indicator: ${sel}`)
                    await DebugHelper.dumpPageState(this.page, 'verify_success_indicator').catch(() => {})
                    return true
                }
            }

            const modalResult = await this.checkModalDialogs()
            if (modalResult !== null) return modalResult
        }

        const artifacts = await DebugHelper.dumpPageState(this.page, 'verify_timeout').catch(() => undefined)
        await this.reportIndicatorDriftToSentry('success_indicator_timeout', {
            expectedSuccessSelectors: TIKTOK_SELECTORS.SUCCESS.INDICATORS,
            note: 'Upload submit likely succeeded but success indicator was not found before timeout. TikTok UI/indicator may have changed.',
        }, artifacts, 'verify_success_indicator')
        return {
            success: false,
            errorType: 'unknown',
            error: 'Upload timed out - success message not found',
            debugArtifacts: artifacts,
        }
    }

    private async checkModalDialogs(): Promise<PublishResult | null> {
        try {
            const dialogs = this.page.locator('div[role="dialog"], div[class*="TUXModal"]')
            const count = await dialogs.count()

            for (let d = 0; d < count; d++) {
                const dialog = dialogs.nth(d)
                if (!await dialog.isVisible().catch(() => false)) continue

                const text = ((await dialog.innerText().catch(() => '')) || '').replace(/\n+/g, ' ').trim()
                if (!text) continue

                this.captureWarningText(text)

                const successKeywords = ['Manage your posts', 'View Profile', 'Upload complete', 'Manage posts']
                if (successKeywords.some(kw => text.includes(kw))) return null

                const nonViolationConfirmKeywords = [
                    'proceed to post',
                    'copyright check',
                    'check is not completed',
                    'post now',
                    '投稿に進みますか',
                    '著作権侵害のチェックが完了していません',
                    '今すぐ投稿',
                ]
                if (nonViolationConfirmKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
                    return null
                }

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

    private async verifyViaDashboard(opts: VerifyOptions): Promise<PublishResult> {
        console.log('[PublishVerifier] Navigating to Content Dashboard...')
        opts.onProgress?.('Checking video status on dashboard...')
        let sawContentListResponse = false
        let lastApiResponseShape: any = null
        let lastUiProbe: any = null
        let dumpedAmbiguousUiProbe = false
        const expectedVideoId = this.normalizeVideoId(opts.expectedVideoId || opts.expectedVideoUrl)

        try {
            let apiData: any = null

            const handler = async (response: Response) => {
                try {
                    if (response.url().includes('tiktokstudio/content/list')) {
                        sawContentListResponse = true
                        const json = await response.json()
                        lastApiResponseShape = {
                            topKeys: json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [],
                            dataKeys: json?.data && typeof json.data === 'object' ? Object.keys(json.data).slice(0, 20) : [],
                            postListType: Array.isArray(json?.data?.post_list) ? 'array' : typeof json?.data?.post_list,
                            postListLength: Array.isArray(json?.data?.post_list) ? json.data.post_list.length : undefined,
                        }
                        if (json?.data?.post_list) apiData = json.data.post_list
                    }
                } catch {}
            }

            this.page.on('response', handler)
            await this.page.goto('https://www.tiktok.com/tiktokstudio/content', { waitUntil: 'domcontentloaded' })

            for (let check = 1; check <= 5; check++) {
                if (this.page.isClosed()) break
                await this.page.waitForTimeout(5000).catch(() => {})
                await this.captureWarningsFromPage()
                const uiStatus = await this.probeDashboardUiStatus(expectedVideoId, opts.expectedCaption, opts.uploadStartTime)
                lastUiProbe = uiStatus
                if (uiStatus?.text) this.captureWarningText(uiStatus.text)
                if (uiStatus && !uiStatus.id && uiStatus.rowCount && !dumpedAmbiguousUiProbe) {
                    dumpedAmbiguousUiProbe = true
                    const dump = await DebugHelper.dumpPageState(this.page, 'verify_dashboard_ui_ambiguous').catch(() => null)
                    const probeJson = await DebugHelper.dumpJson('verify_dashboard_ui_probe', uiStatus).catch(() => '')
                    console.warn('[PublishVerifier] Dashboard UI probe found rows but no safe match', {
                        rowCount: uiStatus.rowCount,
                        recentCandidateCount: uiStatus.recentCandidateCount,
                        timeWindow: uiStatus.timeWindow,
                        probeJson,
                        html: dump?.html,
                    })
                }

                if (apiData?.length > 0) {
                    const apiMatch = this.pickDashboardApiMatch(apiData, opts, expectedVideoId, opts.expectedCaption)
                    const match = apiMatch?.item

                    if (match) {
                        this.page.off('response', handler)
                        const uname = opts.username || 'user'
                        const finalUrl = `https://www.tiktok.com/@${uname}/video/${match.item_id}`
                        const detected = this.deriveDashboardReviewState(match)
                        let reviewing = detected.isReviewing
                        console.log('[PublishVerifier] Dashboard status detection', {
                            itemId: match.item_id,
                            matchedBy: apiMatch?.matchedBy || 'unknown',
                            matchScore: apiMatch?.matchScore,
                            reviewing,
                            source: detected.source,
                            reason: detected.reason,
                            evidence: detected.evidence,
                        })
                        opts.onProgress?.(
                            reviewing
                                ? `Dashboard status: under review (${detected.source})`
                                : `Dashboard status: public (${detected.source})`
                        )
                        if (
                            reviewing &&
                            expectedVideoId &&
                            uiStatus?.id &&
                            this.normalizeVideoId(uiStatus.id) === expectedVideoId &&
                            !uiStatus.isReviewing
                        ) {
                            reviewing = false
                        }
                        if (detected.source === 'fallback:unknown') {
                            await this.reportIndicatorDriftToSentry('dashboard_status_indicator_unknown', {
                                itemId: match.item_id,
                                detection: detected,
                                note: 'Dashboard item schema does not expose known review/public indicators.',
                            }, undefined, 'verify_dashboard_status_detection')
                        }
                        if (reviewing) this.captureWarningText('TikTok marked post as under review/private after publish')
                        return {
                            success: true,
                            videoId: match.item_id,
                            videoUrl: finalUrl,
                            isReviewing: reviewing,
                            publishStatus: reviewing ? 'under_review' : 'public',
                        }
                    }
                }
                if (uiStatus?.id) {
                    this.page.off('response', handler)
                    console.log('[PublishVerifier] Dashboard UI fallback detection', {
                        itemId: uiStatus.id,
                        matchedBy: uiStatus.selectedBy || (expectedVideoId ? 'ui:id' : 'ui:fallback'),
                        captionScore: uiStatus.captionScore,
                        rowTimeSec: uiStatus.rowTimeSec,
                        rowTimeSource: uiStatus.rowTimeSource,
                        timeInWindow: uiStatus.timeInWindow,
                        reviewing: !!uiStatus.isReviewing,
                        rowCount: uiStatus.rowCount,
                        candidates: uiStatus.candidates,
                    })
                    // Build proper public URL from username+videoId — do NOT use raw href from Studio DOM
                    // (Studio hrefs may be relative paths, /tiktokstudio/... URLs, or localhost in dev)
                    const uname = opts.username
                    const builtUrl = uname && uiStatus.id
                        ? `https://www.tiktok.com/@${uname}/video/${uiStatus.id}`
                        : undefined
                    return {
                        success: true,
                        videoId: uiStatus.id,
                        videoUrl: builtUrl,
                        isReviewing: !!uiStatus.isReviewing,
                        publishStatus: uiStatus.isReviewing ? 'under_review' : 'public',
                    }
                }
            }

            this.page.off('response', handler)
        } catch (e: any) {
            console.error('[PublishVerifier] Dashboard check error:', e)
            this.captureWarningText(`dashboard check error: ${e?.message || String(e)}`)
        }

        const artifacts = await DebugHelper.dumpPageState(this.page, 'verify_dashboard_incomplete').catch(() => undefined)
        await this.reportIndicatorDriftToSentry('dashboard_verification_incomplete', {
            note: 'Could not confirm dashboard publish status from API/UI probes. TikTok dashboard selectors or API schema may have changed.',
            diagnostics: {
                sawContentListResponse,
                lastApiResponseShape,
                lastUiProbe,
            },
        }, artifacts, 'verify_dashboard_recheck')
        return {
            success: true,
            warning: 'Verification incomplete - check dashboard manually',
            verificationIncomplete: true,
            isReviewing: false,
            publishStatus: 'verification_incomplete',
            debugArtifacts: artifacts,
        }
    }

    private normalizeVideoId(raw?: any): string | null {
        const value = String(raw || '').trim()
        if (!value) return null
        const match = value.match(/(\d{8,})/)
        return match?.[1] || null
    }

    private pickDashboardApiMatch(
        apiData: any[],
        opts: VerifyOptions,
        expectedVideoId: string | null,
        expectedCaption?: string
    ): { item: any; matchedBy: string; matchScore?: number } | null {
        if (!Array.isArray(apiData) || apiData.length === 0) return null

        if (expectedVideoId) {
            const exact = apiData.find((v: any) => this.normalizeVideoId(v?.item_id || v?.id) === expectedVideoId)
            if (exact) return { item: exact, matchedBy: 'api:video_id_exact', matchScore: 1 }
        }

        if (opts.useUniqueTag && opts.uniqueTag) {
            const tagged = apiData.find((v: any) => String(v?.desc || '').includes(opts.uniqueTag))
            if (tagged) return { item: tagged, matchedBy: 'api:unique_tag', matchScore: 1 }
        }

        const expectedCaptionNorm = this.normalizeCaptionText(expectedCaption)
        const now = Math.floor(Date.now() / 1000)
        const uploadStart = Number(opts.uploadStartTime) || now
        const lowerBound = Math.max(0, uploadStart - 900)
        const upperBound = now + 120
        const recent = apiData
            .filter((v: any) => {
                const createTime = Number.parseInt(String(v?.create_time || '0'), 10)
                return Number.isFinite(createTime) && createTime >= lowerBound && createTime <= upperBound
            })
            .sort((a: any, b: any) => Number(b?.create_time || 0) - Number(a?.create_time || 0))

        if (expectedCaptionNorm) {
            const bestRecentByCaption = recent
                .map((item: any) => ({
                    item,
                    score: this.scoreCaptionMatch(expectedCaptionNorm, this.extractDashboardItemCaption(item)),
                }))
                .sort((a, b) => b.score - a.score)[0]
            if (bestRecentByCaption && bestRecentByCaption.score >= 0.55) {
                return {
                    item: bestRecentByCaption.item,
                    matchedBy: 'api:caption_recent_window',
                    matchScore: bestRecentByCaption.score,
                }
            }

        }

        if (recent[0]) return { item: recent[0], matchedBy: 'api:time_window_latest' }
        return null
    }

    private async probeDashboardUiStatus(
        expectedVideoId: string | null,
        expectedCaption?: string,
        uploadStartTime?: number
    ): Promise<any | null> {
        return this.page.evaluate(({ expectedId, expectedCaptionRaw, uploadStartSec }) => {
            const rowSet = new Set<Element>()
            const linkNodes = Array.from(document.querySelectorAll('a[href*="/video/"]'))

            // Prefer deriving rows from actual video links because TikTok Studio
            // frequently changes row wrappers (e2e -> data-tt div layout).
            for (const link of linkNodes) {
                const row =
                    link.closest('div[data-e2e="recent-post-item"]') ||
                    link.closest('tr') ||
                    link.closest('div[data-tt="components_RowLayout_FlexRow"]') ||
                    link.closest('div[data-tt="components_PostInfoCell_FlexRow"]') ||
                    link.parentElement
                if (row) rowSet.add(row)
            }

            // Legacy fallback selectors (kept for older layouts)
            for (const row of Array.from(document.querySelectorAll(
                'div[data-e2e="recent-post-item"], tr, div[data-tt="components_RowLayout_FlexRow"]'
            ))) {
                if ((row as HTMLElement)?.querySelector?.('a[href*="/video/"]')) rowSet.add(row)
            }

            const rows = Array.from(rowSet)
            if (rows.length === 0) return null

            const nowSec = Math.floor(Date.now() / 1000)
            const uploadSec = Number(uploadStartSec) || nowSec
            const lowerBound = Math.max(0, uploadSec - 900)
            const upperBound = nowSec + 300

            const normalizeId = (raw: string) => {
                const m = (raw || '').match(/(\d{8,})/)
                return m?.[1] || null
            }
            const normalizeCaption = (raw: string) => (raw || '').replace(/\s+/g, ' ').trim().toLowerCase()
            const expectedCaption = normalizeCaption(String(expectedCaptionRaw || ''))
            const scoreCaption = (candidateRaw: string) => {
                if (!expectedCaption) return 0
                const candidate = normalizeCaption(candidateRaw)
                if (!candidate) return 0
                if (candidate === expectedCaption) return 1
                if (candidate.includes(expectedCaption) || expectedCaption.includes(candidate)) return 0.95
                const a = expectedCaption.slice(0, 120)
                const b = candidate.slice(0, 120)
                if (a && b && (b.includes(a) || a.includes(b))) return 0.9
                const aTokens = Array.from(new Set(expectedCaption.split(/[^a-z0-9]+/).filter(t => t.length >= 2)))
                const bTokens = new Set(candidate.split(/[^a-z0-9]+/).filter(t => t.length >= 2))
                if (aTokens.length === 0 || bTokens.size === 0) return 0
                let hits = 0
                for (const t of aTokens) if (bTokens.has(t)) hits++
                return hits / aTokens.length
            }

            const collectTimeStrings = (row: Element, text: string) => {
                const out: string[] = []
                const push = (v: any) => {
                    const s = String(v || '').trim()
                    if (!s) return
                    if (!out.includes(s)) out.push(s)
                }
                push(text)
                const attrs = ['datetime', 'title', 'aria-label', 'data-time', 'data-created-at']
                for (const el of Array.from(row.querySelectorAll('*'))) {
                    for (const a of attrs) push((el as HTMLElement).getAttribute?.(a))
                    const dt = (el as any).dateTime
                    if (dt) push(dt)
                    if (out.length >= 40) break
                }
                return out
            }

            const parseTimeFromStrings = (values: string[]) => {
                const uploadDate = new Date(uploadSec * 1000)
                const tryDate = (d: Date, source: string) => {
                    const ms = d.getTime()
                    if (!Number.isFinite(ms)) return null
                    return { sec: Math.floor(ms / 1000), source }
                }

                for (const raw of values) {
                    const text = String(raw || '').replace(/\s+/g, ' ').trim()
                    if (!text) continue

                    // 1) ISO/parseable absolute timestamps
                    const direct = Date.parse(text)
                    if (Number.isFinite(direct)) return tryDate(new Date(direct), 'ui:time:date_parse')

                    // 2) YYYY-MM-DD HH:mm(:ss) or YYYY/MM/DD
                    let m = text.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[^\d]{0,4}(\d{1,2}):(\d{2})(?::(\d{2}))?/)
                    if (m) {
                        const [, y, mo, d, h, mi, s] = m
                        return tryDate(new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)), 'ui:time:ymd_hm')
                    }

                    // 3) MM-DD HH:mm or MM/DD HH:mm (assume current year)
                    m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[^\d]{0,4}(\d{1,2}):(\d{2})(?::(\d{2}))?\b/)
                    if (m) {
                        const [, mo, d, h, mi, s] = m
                        const dt = new Date(uploadDate)
                        dt.setMonth(Number(mo) - 1, Number(d))
                        dt.setHours(Number(h), Number(mi), Number(s || 0), 0)
                        return tryDate(dt, 'ui:time:md_hm')
                    }

                    // 4) h:mm AM/PM
                    m = text.match(/\b(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)\b/i)
                    if (m) {
                        let h = Number(m[1]) % 12
                        if (m[3].toLowerCase().startsWith('p')) h += 12
                        const dt = new Date(uploadDate)
                        dt.setHours(h, Number(m[2]), 0, 0)
                        return tryDate(dt, 'ui:time:h_m_ampm')
                    }

                    // 5) HH:mm (24h), anchored to upload date
                    m = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/)
                    if (m) {
                        const dt = new Date(uploadDate)
                        dt.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0)
                        // If anchored time is unrealistically far in future, assume previous day.
                        if (Math.floor(dt.getTime() / 1000) > upperBound + 6 * 3600) {
                            dt.setDate(dt.getDate() - 1)
                        }
                        return tryDate(dt, 'ui:time:hm_only')
                    }
                }
                return null
            }

            const candidates = rows.slice(0, 20).map((row) => {
                const h = row as HTMLElement
                const linkEl = row.querySelector('a[href*="/video/"]')
                const href = linkEl?.getAttribute('href') || ''
                const text = (h.innerText || '').slice(0, 400)
                const id = normalizeId(href) || normalizeId(text)
                const captionScore = scoreCaption(text)
                const normalized = text.toLowerCase()
                const isReviewing =
                    normalized.includes('under review') ||
                    normalized.includes('in review') ||
                    normalized.includes('processing')
                const timeProbe = parseTimeFromStrings(collectTimeStrings(row, text))
                const rowTimeSec = timeProbe?.sec ?? null
                const timeInWindow = typeof rowTimeSec === 'number' && rowTimeSec >= lowerBound && rowTimeSec <= upperBound
                return {
                    id,
                    url: href || null,
                    isReviewing,
                    text,
                    captionScore,
                    rowTimeSec,
                    rowTimeSource: timeProbe?.source || null,
                    timeInWindow,
                }
            })

            const recentByTime = candidates
                .filter(c => c.timeInWindow)
                .sort((a, b) => (b.rowTimeSec || 0) - (a.rowTimeSec || 0))

            const selected = expectedId
                ? candidates.find(c => c.id === expectedId) || null
                : (() => {
                    const best = expectedCaption
                        ? [...recentByTime].sort((a, b) => (b.captionScore || 0) - (a.captionScore || 0))[0]
                        : null
                    if (best && (best.captionScore || 0) >= 0.55) return best
                    if (recentByTime.length === 1) return recentByTime[0]
                    return null
                })()
            if (!selected) {
                return {
                    id: null,
                    text: '',
                    selectedBy: null,
                    rowCount: rows.length,
                    candidates: candidates.slice(0, 5).map(c => ({
                        id: c.id,
                        url: c.url,
                        isReviewing: c.isReviewing,
                        captionScore: c.captionScore,
                        rowTimeSec: c.rowTimeSec,
                        rowTimeSource: c.rowTimeSource,
                        timeInWindow: c.timeInWindow,
                    })),
                    recentCandidateCount: recentByTime.length,
                    timeWindow: { lowerBound, upperBound, uploadSec, nowSec },
                }
            }
            const selectedBy = expectedId
                ? 'ui:video_id_exact'
                : ((selected.captionScore || 0) >= 0.55 && expectedCaption ? 'ui:caption_recent_window' : 'ui:time_window_single')

            return {
                ...selected,
                selectedBy,
                rowCount: rows.length,
                recentCandidateCount: recentByTime.length,
                timeWindow: { lowerBound, upperBound, uploadSec, nowSec },
                candidates: candidates.slice(0, 5).map(c => ({
                    id: c.id,
                    url: c.url,
                    isReviewing: c.isReviewing,
                    captionScore: c.captionScore,
                    rowTimeSec: c.rowTimeSec,
                    rowTimeSource: c.rowTimeSource,
                    timeInWindow: c.timeInWindow,
                })),
            }
        }, { expectedId: expectedVideoId, expectedCaptionRaw: expectedCaption, uploadStartSec: uploadStartTime }).catch(() => null)
    }

    private normalizeCaptionText(raw?: string): string {
        return String(raw || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
    }

    private extractDashboardItemCaption(item: any): string {
        return String(item?.desc ?? item?.caption ?? item?.title ?? item?.text ?? '')
    }

    private scoreCaptionMatch(expectedCaptionNorm: string, candidateRaw: string): number {
        const expected = this.normalizeCaptionText(expectedCaptionNorm)
        const candidate = this.normalizeCaptionText(candidateRaw)
        if (!expected || !candidate) return 0
        if (expected === candidate) return 1
        if (candidate.includes(expected) || expected.includes(candidate)) return 0.95

        const expectedShort = expected.slice(0, 120)
        const candidateShort = candidate.slice(0, 120)
        if (expectedShort && candidateShort && (candidateShort.includes(expectedShort) || expectedShort.includes(candidateShort))) {
            return 0.9
        }

        const expectedTokens = Array.from(new Set(expected.split(/[^a-z0-9]+/).filter(t => t.length >= 2)))
        const candidateTokens = new Set(candidate.split(/[^a-z0-9]+/).filter(t => t.length >= 2))
        if (expectedTokens.length === 0 || candidateTokens.size === 0) return 0
        let hit = 0
        for (const token of expectedTokens) {
            if (candidateTokens.has(token)) hit++
        }
        return hit / expectedTokens.length
    }

    private async captureWarningsFromPage(): Promise<void> {
        try {
            const texts = await this.page.evaluate(() => {
                const selectors = [
                    '[role="alert"]',
                    '[data-e2e="toast-message"]',
                    '.tiktok-toast',
                    'div[role="dialog"]',
                ]
                const visibleTexts: string[] = []
                const seen = new Set<Element>()
                for (const sel of selectors) {
                    for (const el of Array.from(document.querySelectorAll(sel))) {
                        if (seen.has(el)) continue
                        seen.add(el)
                        const h = el as HTMLElement
                        const style = window.getComputedStyle(h)
                        const visible = !!(h.offsetWidth || h.offsetHeight || h.getClientRects().length) &&
                            style.visibility !== 'hidden' && style.display !== 'none'
                        if (!visible) continue
                        const text = (h.innerText || '').replace(/\s+/g, ' ').trim()
                        if (text) visibleTexts.push(text)
                    }
                }
                return visibleTexts.slice(0, 10)
            })
            for (const text of texts) this.captureWarningText(text)
        } catch {}
    }

    private captureWarningText(text: string) {
        const normalized = (text || '').replace(/\s+/g, ' ').trim()
        if (!normalized) return
        const lower = normalized.toLowerCase()
        const keywords = [
            'review',
            'processing',
            'violation',
            'restricted',
            'copyright',
            'failed',
            'warning',
            'try again',
            'captcha',
        ]
        if (keywords.some(k => lower.includes(k))) {
            this.warnings.add(normalized.slice(0, 240))
        }
    }

    private async reportIndicatorDriftToSentry(
        issue: string,
        data: Record<string, any>,
        existingArtifacts?: { screenshot?: string; html?: string },
        stage?: string
    ): Promise<void> {
        try {
            const pageUrl = this.page.url()
            const cacheKey = `${stage || 'unknown'}:${issue}:${pageUrl.split('?')[0]}`
            const now = Date.now()
            const last = PublishVerifier.indicatorDriftReportCache.get(cacheKey) || 0
            // Throttle duplicate mails/events for same page+issue during retry loops.
            if (now - last < 10 * 60 * 1000) return
            PublishVerifier.indicatorDriftReportCache.set(cacheKey, now)

            const artifacts = existingArtifacts || await DebugHelper.dumpPageState(this.page, `indicator_drift_${issue}`).catch(() => undefined)
            const signals = await DebugHelper.collectPageSignals(this.page).catch(() => null)
            const signalsPath = signals ? await DebugHelper.dumpJson(`indicator_drift_${issue}_signals`, signals).catch(() => undefined) : undefined

            const attachments: any[] = []
            const screenshotAttachment = await this.buildFileAttachment(
                artifacts?.screenshot,
                'image/png',
                false,
            )
            if (screenshotAttachment) attachments.push(screenshotAttachment)

            const htmlAttachment = await this.buildFileAttachment(
                artifacts?.html,
                'text/html; charset=utf-8',
                true,
                512 * 1024,
            )
            if (htmlAttachment) attachments.push(htmlAttachment)

            const signalsAttachment = await this.buildFileAttachment(
                signalsPath,
                'application/json',
                true,
                256 * 1024,
            )
            if (signalsAttachment) attachments.push(signalsAttachment)

            Sentry.withScope(scope => {
                if (!scope) return
                scope.setLevel('warning')
                scope.setTag('module', 'tiktok')
                scope.setTag('operation', 'publish_verify')
                scope.setTag('issue_type', 'indicator_drift')
                scope.setTag('issue', issue)
                scope.setTag('stage', stage || 'unknown')
                scope.setExtra('page_url', pageUrl)
                scope.setExtra('verify_stage', stage || 'unknown')
                scope.setExtra('artifacts_screenshot_path', artifacts?.screenshot || '')
                scope.setExtra('artifacts_html_path', artifacts?.html || '')
                scope.setExtra('artifacts_signals_path', signalsPath || '')
                scope.setExtra('warning_snapshot', Array.from(this.warnings).slice(0, 10))
                scope.setContext('indicator_drift', {
                    issue,
                    stage: stage || 'unknown',
                    ...this.limitDeepData(data),
                    pageUrl,
                } as any)

                for (const attachment of attachments) {
                    try { scope.addAttachment(attachment) } catch {}
                }

                Sentry.captureMessage(`[TikTok][PublishVerifier] Indicator drift suspected: ${issue} (${stage || 'unknown'})`)
            })
        } catch (err) {
            console.warn('[PublishVerifier] Failed to report indicator drift to Sentry:', err)
        }
    }


    private async buildFileAttachment(
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
                const clipped = text.length > maxBytes ? `${text.slice(0, maxBytes)}\n\n<!-- truncated -->` : text
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

    private limitDeepData(data: any) {
        try {
            const raw = JSON.stringify(data)
            if (!raw) return data
            if (raw.length <= 10_000) return data
            return {
                _truncated: true,
                preview: raw.slice(0, 10_000),
            }
        } catch {
            return { _unserializable: true }
        }
    }

    private deriveDashboardReviewState(item: any): {
        isReviewing: boolean
        source: string
        reason: string
        evidence: Record<string, any>
    } {
        const evidence: Record<string, any> = {
            privacy_level: item?.privacy_level,
            privacyLevel: item?.privacyLevel,
            public_status: item?.public_status,
            publicStatus: item?.publicStatus,
            status: item?.status,
            post_status: item?.post_status,
            review_status: item?.review_status,
            audit_status: item?.audit_status,
            visibility: item?.visibility,
            is_reviewing: item?.is_reviewing,
            under_review: item?.under_review,
        }

        if (typeof item?.is_reviewing === 'boolean') {
            return {
                isReviewing: item.is_reviewing,
                source: 'api:is_reviewing',
                reason: `is_reviewing=${item.is_reviewing}`,
                evidence,
            }
        }
        if (typeof item?.under_review === 'boolean') {
            return {
                isReviewing: item.under_review,
                source: 'api:under_review',
                reason: `under_review=${item.under_review}`,
                evidence,
            }
        }

        const candidates = [
            ['public_status', item?.public_status],
            ['publicStatus', item?.publicStatus],
            ['status', item?.status],
            ['post_status', item?.post_status],
            ['review_status', item?.review_status],
            ['audit_status', item?.audit_status],
            ['visibility', item?.visibility],
        ] as const

        for (const [key, raw] of candidates) {
            if (raw == null) continue
            const normalized = String(raw).trim().toLowerCase()
            if (!normalized) continue

            if (
                normalized.includes('under review') ||
                normalized.includes('in review') ||
                normalized.includes('reviewing') ||
                normalized.includes('processing') ||
                normalized.includes('pending') ||
                normalized.includes('audit') ||
                normalized.includes('checking') ||
                normalized.includes('审核') ||
                normalized.includes('審核')
            ) {
                return {
                    isReviewing: true,
                    source: `api:${key}`,
                    reason: `${key}=${String(raw)}`,
                    evidence,
                }
            }

            if (
                normalized === 'public' ||
                normalized === 'published' ||
                normalized.includes('public') ||
                normalized.includes('published')
            ) {
                return {
                    isReviewing: false,
                    source: `api:${key}`,
                    reason: `${key}=${String(raw)}`,
                    evidence,
                }
            }
        }

        if (typeof item?.privacy_level === 'number') {
            const isReviewing = item.privacy_level !== 1
            return {
                isReviewing,
                source: 'api:privacy_level',
                reason: `privacy_level=${item.privacy_level}`,
                evidence,
            }
        }

        if (typeof item?.privacyLevel === 'number') {
            const isReviewing = item.privacyLevel !== 1
            return {
                isReviewing,
                source: 'api:privacyLevel',
                reason: `privacyLevel=${item.privacyLevel}`,
                evidence,
            }
        }

        return {
            isReviewing: true,
            source: 'fallback:unknown',
            reason: 'No reliable dashboard status indicator found',
            evidence,
        }
    }
}

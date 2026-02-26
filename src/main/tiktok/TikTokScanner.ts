import { Page } from 'playwright-core'
import { browserService } from '@main/services/BrowserService'
import fs from 'fs'
import path from 'path'
import { net } from 'electron'
import { AppSettingsService } from '@main/services/AppSettingsService'
import { Downloader } from '@tobyg74/tiktok-api-dl'

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface VideoInfo {
  platform_id: string
  url: string
  thumbnail: string
  description: string
  author: string
  author_id: string
  duration_seconds: number
  stats: { views?: number; likes?: number; comments?: number; shares?: number }
  tags: string[]
  created_at: number
  download_url: string
}

export interface ScanOptions {
  limit?: number
  sortOrder?: string
  timeRange?: string
  startDate?: string
  endDate?: string
  cookies?: any[]
}

export interface ScanResult {
  videos: VideoInfo[]
  hasMore?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Estimate created_at from TikTok video ID (snowflake timestamp in upper bits) */
function createdAtFromId(id: string): number {
  try {
    const n = BigInt(id)
    return Number(n >> 32n) * 1000
  } catch {
    return Date.now()
  }
}

function parseStatNum(s: string | undefined): number {
  if (!s) return 0
  const txt = s.trim().toUpperCase()
  if (txt.endsWith('M')) return Math.round(parseFloat(txt) * 1_000_000)
  if (txt.endsWith('K')) return Math.round(parseFloat(txt) * 1_000)
  return parseInt(txt.replace(/[^0-9]/g, '')) || 0
}

function filterByTimeRange(videos: VideoInfo[], opts: ScanOptions): VideoInfo[] {
  if (!opts.timeRange || opts.timeRange === 'history_and_future') return videos
  const now = Date.now()
  const start = opts.startDate ? new Date(opts.startDate).getTime() : 0
  const endRaw = opts.endDate ? new Date(opts.endDate) : new Date()
  // Include the entire end date (23:59:59.999)
  endRaw.setHours(23, 59, 59, 999)
  const end = endRaw.getTime()
  return videos.filter(v => {
    if (opts.timeRange === 'future_only') return v.created_at >= now
    if (opts.timeRange === 'from_now') return v.created_at >= now
    if (opts.timeRange === 'history_only') return v.created_at < now
    if (opts.timeRange === 'custom' || opts.timeRange === 'custom_range') {
      return v.created_at >= start && v.created_at <= end
    }
    return true
  })
}

function applySortOrder(videos: VideoInfo[], sortOrder?: string): VideoInfo[] {
  const arr = [...videos]
  switch (sortOrder) {
    case 'oldest':      arr.sort((a, b) => a.created_at - b.created_at); break
    case 'most_liked':   arr.sort((a, b) => (b.stats.likes || 0) - (a.stats.likes || 0)); break
    case 'most_viewed':  arr.sort((a, b) => (b.stats.views || 0) - (a.stats.views || 0)); break
    default:             arr.sort((a, b) => b.created_at - a.created_at); break // newest
  }
  return arr
}

// ── Inject cookies into Playwright page ─────────────────────────────────────

async function injectCookies(page: Page, cookies: any[]) {
  if (!cookies || cookies.length === 0) return
  try {
    const ctx = page.context()
    const normalizeSameSite = (raw: any): 'Strict' | 'Lax' | 'None' | undefined => {
      if (raw == null || raw === '') return undefined
      const v = String(raw).trim().toLowerCase()
      if (v === 'strict') return 'Strict'
      if (v === 'lax') return 'Lax'
      if (v === 'none' || v === 'no_restriction' || v === 'no restriction') return 'None'
      if (v === 'unspecified' || v === 'unspec' || v === 'default') return undefined
      return undefined
    }
    const normalized = cookies
      .filter(c => c?.name && c?.value)
      .map(c => {
        const sameSite = normalizeSameSite(c.sameSite)
        const cookie: any = {
          name: String(c.name),
          value: String(c.value),
          domain: c.domain || '.tiktok.com',
          path: c.path || '/',
          httpOnly: c.httpOnly ?? false,
          secure: c.secure ?? true,
        }
        if (sameSite) cookie.sameSite = sameSite
        // Chrome exports often use expirationDate (seconds). Keep only valid numeric values.
        const expiresRaw = c.expires ?? c.expirationDate
        const expiresNum = Number(expiresRaw)
        if (Number.isFinite(expiresNum) && expiresNum > 0) cookie.expires = expiresNum
        return cookie
      })
    if (normalized.length > 0) await ctx.addCookies(normalized)
    console.log(`[TikTokScanner] Injected ${normalized.length} cookies`)
  } catch (err: any) {
    console.warn('[TikTokScanner] Cookie injection failed:', err?.message)
  }
}

// ── Extract video items from current page DOM ────────────────────────────────

const WAIT_SELECTORS = [
  '[data-e2e="user-post-item"]',
  '[data-e2e="search_top-item"]',
  'div[class*="DivItemContainer"]',
  'a[href*="/video/"]',
].join(',')

async function extractVideosFromPage(page: Page, authorFilter?: string): Promise<VideoInfo[]> {
  return page.evaluate(({ authorFilter }) => {
    const results: any[] = []
    const seen = new Set<string>()

    const links = Array.from(document.querySelectorAll('a'))
      .filter(a => a.href?.includes('/video/') && !a.href.includes('/search'))

    for (const link of links) {
      const idMatch = (link.getAttribute('href') || '').match(/\/video\/(\d+)/)
      if (!idMatch) continue
      const id = idMatch[1]
      if (seen.has(id)) continue
      seen.add(id)

      const container: Element | null =
        link.closest('[data-e2e="user-post-item"]') ||
        link.closest('div[class*="DivItemContainer"]') ||
        link.parentElement

      let views = '0', likes = '0', comments = '0', shares = '0'
      let desc = ''
      if (container) {
        views = container.querySelector('[data-e2e="video-views"]')?.textContent || '0'
        likes = container.querySelector('[data-e2e="video-likes"]')?.textContent || '0'
        comments = container.querySelector('[data-e2e="video-comments"]')?.textContent || '0'
        shares = container.querySelector('[data-e2e="video-shares"]')?.textContent || '0'
        // TikTok puts caption in desc container or img alt
        const descEl = container.querySelector('[data-e2e="user-post-item-desc"]')
        desc = descEl?.textContent?.trim() || ''
      }

      const img = link.querySelector('img') as HTMLImageElement | null
      const thumb = img?.src || ''
      // Fallback description from img alt text (TikTok puts caption there)
      if (!desc && img?.alt) desc = img.alt.trim()

      // Author from URL e.g. /@username/video/123
      const urlAuthor = (link.href.match(/@([\w.-]+)\/video\//) || [])[1] || ''
      if (authorFilter && urlAuthor && urlAuthor.toLowerCase() !== authorFilter.toLowerCase()) continue

      results.push({
        id,
        url: (link as HTMLAnchorElement).href,
        thumb,
        desc,
        views,
        likes,
        comments,
        shares,
        urlAuthor,
      })
    }
    return results
  }, { authorFilter: authorFilter || null })
    .then(items => items.map(v => ({
      platform_id: v.id,
      url: v.url,
      thumbnail: v.thumb || '',
      description: v.desc || '',
      author: v.urlAuthor || authorFilter || '',
      author_id: v.urlAuthor || '',
      duration_seconds: 0,
      stats: {
        views: parseStatNum(v.views),
        likes: parseStatNum(v.likes),
        comments: parseStatNum(v.comments),
        shares: parseStatNum(v.shares),
      },
      tags: [],
      created_at: createdAtFromId(v.id),
      download_url: '',
    })))
}

// ── TikTokScanner ────────────────────────────────────────────────────────────

export class TikTokScanner {

  // ── Scan Profile (browser-based) ─────────────────

  async scanProfile(username: string, opts: ScanOptions = {}): Promise<ScanResult> {
    const limit = opts.limit || 50
    const cleanName = username.replace('@', '')
    console.log(`[TikTokScanner] Scanning profile: @${cleanName} (limit=${limit})`)

    await browserService.init(false)
    const page = await browserService.newPage()
    if (!page) return { videos: [] }

    try {
      if (opts.cookies?.length) await injectCookies(page, opts.cookies)

      await page.goto(`https://www.tiktok.com/@${cleanName}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      })

      // Wait for video items
      await page.waitForSelector(WAIT_SELECTORS, { timeout: 15000 }).catch(() => {})

      const collected = new Map<string, VideoInfo>()
      const MAX_ROUNDS = Math.ceil(limit / 12) + 8
      let prevCount = 0, zeroRetries = 0

      for (let round = 0; round < MAX_ROUNDS && collected.size < limit; round++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(1800)

        const batch = await extractVideosFromPage(page, cleanName)
        let newInRound = 0
        for (const v of batch) {
          if (!collected.has(v.platform_id)) {
            collected.set(v.platform_id, v)
            newInRound++
          }
        }

        console.log(`[TikTokScanner] Round ${round + 1}: +${newInRound} new (total=${collected.size})`)

        if (batch.length === 0 && ++zeroRetries >= 3) break
        else if (batch.length > 0) zeroRetries = 0
        if (batch.length === prevCount && newInRound === 0 && batch.length > 0) break
        prevCount = batch.length
      }

      const allVideos = Array.from(collected.values())
      // Filter by time range FIRST, then slice to limit (avoids losing valid items)
      const filtered = filterByTimeRange(allVideos, opts)
      const videos = applySortOrder(filtered, opts.sortOrder).slice(0, limit)
      console.log(`[TikTokScanner] Found ${videos.length} videos from @${cleanName}`)
      return { videos }

    } catch (err: any) {
      console.error(`[TikTokScanner] Profile scan failed:`, err.message)
      return { videos: [] }
    } finally {
      await page.close().catch(() => {})
    }
  }

  // ── Scan Keyword (browser-based) ─────────────────

  async scanKeyword(keyword: string, opts: ScanOptions = {}): Promise<ScanResult> {
    const limit = opts.limit || 50
    const cleanKw = encodeURIComponent(keyword.replace('#', ''))
    console.log(`[TikTokScanner] Scanning keyword: ${keyword} (limit=${limit})`)

    await browserService.init(false)
    const page = await browserService.newPage()
    if (!page) return { videos: [] }

    try {
      if (opts.cookies?.length) await injectCookies(page, opts.cookies)

      await page.goto(`https://www.tiktok.com/search?q=${cleanKw}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      })
      await page.waitForSelector(WAIT_SELECTORS, { timeout: 15000 }).catch(() => {})

      const collected = new Map<string, VideoInfo>()
      const MAX_ROUNDS = Math.ceil(limit / 10) + 5
      let prevCount = 0, zeroRetries = 0

      for (let round = 0; round < MAX_ROUNDS && collected.size < limit; round++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(2000)

        const batch = await extractVideosFromPage(page)
        let newInRound = 0
        for (const v of batch) {
          if (!collected.has(v.platform_id)) {
            collected.set(v.platform_id, v)
            newInRound++
          }
        }

        if (batch.length === 0 && ++zeroRetries >= 3) break
        else if (batch.length > 0) zeroRetries = 0
        if (batch.length === prevCount && newInRound === 0 && batch.length > 0) break
        prevCount = batch.length
      }

      const allVideos = Array.from(collected.values())
      // Filter by time range FIRST, then slice to limit
      const filtered = filterByTimeRange(allVideos, opts)
      const videos = applySortOrder(filtered, opts.sortOrder).slice(0, limit)
      console.log(`[TikTokScanner] Keyword found ${videos.length} videos`)
      return { videos }

    } catch (err: any) {
      console.error(`[TikTokScanner] Keyword scan failed:`, err.message)
      return { videos: [] }
    } finally {
      await page.close().catch(() => {})
    }
  }

  // ── Download Video ────────────────────────────────

  async downloadVideo(videoUrl: string, videoId: string): Promise<{ filePath: string }> {
    const downloadDir = AppSettingsService.getMediaStoragePath()
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

    const filePath = path.join(downloadDir, `${videoId}.mp4`)

    // Cache check — skip if valid file already exists
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      if (stats.size > 50 * 1024) {
        console.log(`[TikTokScanner] Cache hit: ${filePath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
        return { filePath }
      }
      // Corrupt cache — delete and re-download
      fs.unlinkSync(filePath)
    }

    // Phase 1: Extract mp4 stream URL via @tobyg74/tiktok-api-dl
    let streamUrl = ''
    try {
      console.log(`[TikTokScanner] Extracting stream URL for ${videoId}...`)
      const result = await Promise.race([
        // @ts-ignore — library types may be incomplete
        Downloader(videoUrl, { version: 'v1' }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Extraction timed out (60s)')), 60000)),
      ]) as any

      if (result?.status === 'success' && result.result?.video) {
        const playAddr = result.result.video.playAddr
        if (Array.isArray(playAddr) && playAddr.length > 0) streamUrl = playAddr[0]
        else if (typeof playAddr === 'string') streamUrl = playAddr
      }
    } catch (err: any) {
      console.error(`[TikTokScanner] Library extraction failed:`, err.message)
    }

    if (!streamUrl) throw new Error(`Could not extract download URL for video ${videoId}`)

    // Phase 2: Download mp4 binary
    console.log(`[TikTokScanner] Downloading video ${videoId}...`)
    const response = await net.fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
    })
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 50 * 1024) throw new Error(`Downloaded file too small (${buffer.length}B) — likely not a video`)

    fs.writeFileSync(filePath, buffer)
    console.log(`[TikTokScanner] Downloaded: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`)
    return { filePath }
  }

  // ── Download Thumbnail ────────────────────────────

  async downloadThumbnail(thumbnailUrl: string, videoId: string): Promise<string | null> {
    if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) return null

    const thumbDir = AppSettingsService.getThumbsDir()
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })

    const filePath = path.join(thumbDir, `${videoId}.jpg`)
    if (fs.existsSync(filePath)) return filePath

    try {
      const response = await net.fetch(thumbnailUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' },
      })
      if (!response.ok) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(filePath, buffer)
      return filePath
    } catch {
      return null
    }
  }
}

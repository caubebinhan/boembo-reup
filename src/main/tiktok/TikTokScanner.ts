import { Page } from 'playwright-core'
import { browserService } from '@main/services/BrowserService'
import fs from 'fs'
import path from 'path'
import { net } from 'electron'
import { AppSettingsService } from '@main/services/AppSettingsService'

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
  const end = opts.endDate ? new Date(opts.endDate).getTime() : now
  return videos.filter(v => {
    if (opts.timeRange === 'future_only') return v.created_at >= now
    if (opts.timeRange === 'from_now') return v.created_at >= now
    if (opts.timeRange === 'custom') return v.created_at >= start && v.created_at <= end
    return true
  })
}

function applySortOrder(videos: VideoInfo[], sortOrder?: string): VideoInfo[] {
  const arr = [...videos]
  if (sortOrder === 'oldest') arr.sort((a, b) => a.created_at - b.created_at)
  else arr.sort((a, b) => b.created_at - a.created_at) // newest default
  return arr
}

// ── Inject cookies into Playwright page ─────────────────────────────────────

async function injectCookies(page: Page, cookies: any[]) {
  if (!cookies || cookies.length === 0) return
  try {
    const ctx = page.context()
    const normalized = cookies
      .filter(c => c?.name && c?.value)
      .map(c => ({
        name: String(c.name),
        value: String(c.value),
        domain: c.domain || '.tiktok.com',
        path: c.path || '/',
        httpOnly: c.httpOnly ?? false,
        secure: c.secure ?? true,
        sameSite: (c.sameSite as any) || 'None',
      }))
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

      let views = '0', likes = '0', comments = '0'
      if (container) {
        views = container.querySelector('[data-e2e="video-views"]')?.textContent || '0'
        likes = container.querySelector('[data-e2e="video-likes"]')?.textContent || '0'
        comments = container.querySelector('[data-e2e="video-comments"]')?.textContent || '0'
      }

      const img = link.querySelector('img') as HTMLImageElement | null
      const thumb = img?.src || ''

      // Author from URL e.g. /video/@username/video/123
      const urlAuthor = (link.href.match(/@([\w.-]+)\/video\//) || [])[1] || ''
      if (authorFilter && urlAuthor && urlAuthor.toLowerCase() !== authorFilter.toLowerCase()) continue

      results.push({
        id,
        url: (link as HTMLAnchorElement).href,
        thumb,
        views,
        likes,
        comments,
        urlAuthor,
      })
    }
    return results
  }, { authorFilter: authorFilter || null })
    .then(items => items.map(v => ({
      platform_id: v.id,
      url: v.url,
      thumbnail: v.thumb || '',
      description: '',
      author: v.urlAuthor || authorFilter || '',
      author_id: v.urlAuthor || '',
      duration_seconds: 0,
      stats: {
        views: parseStatNum(v.views),
        likes: parseStatNum(v.likes),
        comments: parseStatNum(v.comments),
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
      const filtered = filterByTimeRange(allVideos.slice(0, limit), opts)
      const videos = applySortOrder(filtered, opts.sortOrder)
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
      const filtered = filterByTimeRange(allVideos.slice(0, limit), opts)
      const videos = applySortOrder(filtered, opts.sortOrder)
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
    if (fs.existsSync(filePath)) {
      console.log(`[TikTokScanner] Already exists: ${filePath}`)
      return { filePath }
    }

    console.log(`[TikTokScanner] Downloading video ${videoId}...`)
    const response = await net.fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.tiktok.com/',
      },
    })
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
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

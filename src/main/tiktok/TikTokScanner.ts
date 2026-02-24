import { net } from 'electron'

export interface ScanOptions {
    limit?: number
    sortOrder?: 'newest' | 'oldest' | 'most_liked' | 'most_viewed'
    timeRange?: 'history_only' | 'future_only' | 'history_and_future'
}

export interface VideoInfo {
    platform_id: string
    platform: string
    url: string
    description: string
    author: string
    author_id: string
    thumbnail: string
    duration_seconds: number
    stats: {
        views: number
        likes: number
        comments: number
        shares: number
    }
    tags: string[]
    created_at: number
    download_url?: string
}

export interface ScanResult {
    videos: VideoInfo[]
    cursor?: string
    hasMore?: boolean
}

/**
 * TikTok scanner using TikWM API for fetching video data.
 * No browser needed for scanning — only for publishing.
 */
export class TikTokScanner {
    private baseUrl = 'https://www.tikwm.com'

    /** Scan a user profile for videos */
    async scanProfile(username: string, opts: ScanOptions = {}): Promise<ScanResult> {
        const limit = opts.limit || 30
        const cleanName = username.replace('@', '')

        try {
            console.log(`[TikTokScanner] Scanning profile: @${cleanName} (limit=${limit})`)

            const body = new URLSearchParams({
                unique_id: cleanName,
                count: String(Math.min(limit, 35)),
                cursor: '0',
            })

            const data = await this.apiRequest('/api/user/posts', body)

            if (!data?.videos || !Array.isArray(data.videos)) {
                console.warn('[TikTokScanner] No videos in response:', data)
                return { videos: [] }
            }

            const videos: VideoInfo[] = data.videos
                .slice(0, limit)
                .map((v: any) => this.mapVideo(v))

            console.log(`[TikTokScanner] Found ${videos.length} videos from @${cleanName}`)
            return { videos, hasMore: data.hasMore || false, cursor: data.cursor }

        } catch (err: any) {
            console.error(`[TikTokScanner] Profile scan failed:`, err.message)

            if (err.message?.includes('CAPTCHA') || err.message?.includes('captcha')) {
                throw new Error('CAPTCHA detected — manual verification required')
            }

            return { videos: [] }
        }
    }

    /** Scan keyword/hashtag for videos */
    async scanKeyword(keyword: string, opts: ScanOptions = {}): Promise<ScanResult> {
        const limit = opts.limit || 30
        const cleanKw = keyword.replace('#', '')

        try {
            console.log(`[TikTokScanner] Scanning keyword: #${cleanKw} (limit=${limit})`)

            const body = new URLSearchParams({
                keywords: cleanKw,
                count: String(Math.min(limit, 30)),
                cursor: '0',
            })

            const data = await this.apiRequest('/api/feed/search', body)

            if (!data?.videos || !Array.isArray(data.videos)) {
                return { videos: [] }
            }

            const videos: VideoInfo[] = data.videos
                .slice(0, limit)
                .map((v: any) => this.mapVideo(v))

            console.log(`[TikTokScanner] Found ${videos.length} videos for #${cleanKw}`)
            return { videos, hasMore: data.hasMore || false }

        } catch (err: any) {
            console.error(`[TikTokScanner] Keyword scan failed:`, err.message)
            return { videos: [] }
        }
    }

    /** Download video to local path */
    async downloadVideo(videoUrl: string, videoId: string, _opts: any = {}): Promise<{ filePath: string }> {
        const fs = require('fs')
        const path = require('path')
        const os = require('os')

        const downloadDir = path.join(os.homedir(), 'boembo-downloads')
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

        const filePath = path.join(downloadDir, `${videoId}.mp4`)

        // If already downloaded, skip
        if (fs.existsSync(filePath)) {
            console.log(`[TikTokScanner] Already downloaded: ${filePath}`)
            return { filePath }
        }

        console.log(`[TikTokScanner] Downloading video ${videoId}...`)

        // Use TikWM download endpoint
        const downloadUrl = videoUrl.startsWith('http')
            ? videoUrl
            : `${this.baseUrl}${videoUrl}`

        return new Promise((resolve, reject) => {
            const request = net.request(downloadUrl)
            const chunks: Buffer[] = []

            request.on('response', (response) => {
                response.on('data', (chunk) => chunks.push(chunk as Buffer))
                response.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks)
                        fs.writeFileSync(filePath, buffer)
                        console.log(`[TikTokScanner] Downloaded: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`)
                        resolve({ filePath })
                    } catch (err) {
                        reject(err)
                    }
                })
            })

            request.on('error', reject)
            request.end()
        })
    }

    /** Publish video (stub — needs browser/puppeteer implementation) */
    async publishVideo(_filePath: string, _caption: string, _cookies: any, _opts: any = {}): Promise<{ success: boolean, videoUrl: string, videoId: string }> {
        // TODO: Implement via puppeteer/playwright
        console.warn('[TikTokScanner] publishVideo is not yet implemented — requires browser automation')
        return {
            success: false,
            videoUrl: '',
            videoId: '',
        }
    }

    // ── Private helpers ────────────────────────────

    private async apiRequest(endpoint: string, body: URLSearchParams): Promise<any> {
        return new Promise((resolve, reject) => {
            const request = net.request({
                method: 'POST',
                url: `${this.baseUrl}${endpoint}`,
            })

            request.setHeader('Content-Type', 'application/x-www-form-urlencoded')
            request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

            const chunks: Buffer[] = []
            request.on('response', (response) => {
                response.on('data', (chunk) => chunks.push(chunk as Buffer))
                response.on('end', () => {
                    try {
                        const text = Buffer.concat(chunks).toString()
                        const json = JSON.parse(text)

                        if (json.code !== 0 && json.code !== undefined) {
                            reject(new Error(json.msg || `API error code: ${json.code}`))
                            return
                        }

                        resolve(json.data || json)
                    } catch (err) {
                        reject(new Error('Failed to parse API response'))
                    }
                })
            })

            request.on('error', reject)
            request.write(body.toString())
            request.end()
        })
    }

    private mapVideo(v: any): VideoInfo {
        return {
            platform_id: v.video_id || v.id || String(v.create_time),
            platform: 'tiktok',
            url: `https://www.tiktok.com/@${v.author?.unique_id || 'user'}/video/${v.video_id || v.id}`,
            description: v.title || '',
            author: v.author?.nickname || v.author?.unique_id || '',
            author_id: v.author?.unique_id || v.author?.id || '',
            thumbnail: v.cover || v.origin_cover || '',
            duration_seconds: v.duration || 0,
            stats: {
                views: v.play_count || 0,
                likes: v.digg_count || 0,
                comments: v.comment_count || 0,
                shares: v.share_count || 0,
            },
            tags: (v.title || '').match(/#\w+/g) || [],
            created_at: (v.create_time || 0) * 1000,
            download_url: v.play || v.wmplay || '',
        }
    }
}

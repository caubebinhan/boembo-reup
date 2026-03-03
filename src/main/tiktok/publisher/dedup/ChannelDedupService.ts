import { TikTokScanner } from '@main/tiktok/TikTokScanner'
import {
  computeMediaSignature,
  compareMediaSignatures,
  type MediaSignature,
  type MediaSignatureComputeResult,
} from './MediaSimilarity'

export type ChannelDedupResult = {
  duplicate: boolean
  score: number
  threshold: number
  matchedVideoUrl?: string
  matchedVideoId?: string
  channelVideosChecked: number
  skippedReason?: string
}

type CachedChannelVideos = {
  videos: { platform_id: string; download_url: string; description?: string }[]
  fetchedAt: number
}

type CachedSignature = {
  signature: MediaSignature | null
  computedAt: number
  skippedReason?: string
}

/**
 * Channel-level dedup: scan the target TikTok account's published videos
 * and compare AV signatures against the candidate video before publishing.
 *
 * Uses two layers of caching:
 * - In-memory cache for channel video lists (TTL-based, default 10 min)
 * - In-memory cache for AV signatures per channel video (permanent per session)
 */
export class ChannelDedupService {
  // Cache channel video lists per account username
  private static channelVideoCache = new Map<string, CachedChannelVideos>()
  // Cache AV signatures per channel video ID
  private static signatureCache = new Map<string, CachedSignature>()

  /**
   * Check if a candidate video is similar to any video already on the target channel.
   */
  static async checkAgainstChannel(opts: {
    candidateFilePath: string
    accountUsername: string
    accountCookies: any[]
    threshold?: number
    maxChannelVideos?: number
    cacheTtlMs?: number
    onProgress?: (msg: string) => void
  }): Promise<ChannelDedupResult> {
    const threshold = opts.threshold ?? 0.93
    const maxChannelVideos = opts.maxChannelVideos ?? 30
    const cacheTtlMs = opts.cacheTtlMs ?? 10 * 60 * 1000 // 10 minutes
    const log = opts.onProgress || (() => {})

    // 1. Compute AV signature for the candidate video
    log(`Computing AV signature for candidate video...`)
    const candidateSigResult: MediaSignatureComputeResult = await computeMediaSignature(opts.candidateFilePath).catch((err: any) => ({
      skippedReason: String(err?.message || err),
    }))

    if (!candidateSigResult.signature) {
      return {
        duplicate: false, score: 0, threshold,
        channelVideosChecked: 0,
        skippedReason: `candidate_signature_failed: ${candidateSigResult.skippedReason || 'unknown'}`,
      }
    }

    // 2. Get channel videos (cached)
    const cacheKey = opts.accountUsername.replace('@', '').toLowerCase()
    const cached = this.channelVideoCache.get(cacheKey)
    let channelVideos: CachedChannelVideos['videos']

    if (cached && (Date.now() - cached.fetchedAt) < cacheTtlMs) {
      channelVideos = cached.videos
      log(`Using cached channel video list (${channelVideos.length} videos)`)
    } else {
      log(`Scanning channel @${opts.accountUsername} for existing videos...`)
      try {
        const scanner = new TikTokScanner()
        const result = await scanner.scanProfile(opts.accountUsername, {
          limit: maxChannelVideos,
          sortOrder: 'newest',
          cookies: opts.accountCookies,
        })
        channelVideos = result.videos.map(v => ({
          platform_id: v.platform_id,
          download_url: v.download_url || `https://www.tiktok.com/@${opts.accountUsername}/video/${v.platform_id}`,
          description: v.description,
        }))
        this.channelVideoCache.set(cacheKey, {
          videos: channelVideos,
          fetchedAt: Date.now(),
        })
        log(`Found ${channelVideos.length} videos on channel`)
      } catch (err: any) {
        return {
          duplicate: false, score: 0, threshold,
          channelVideosChecked: 0,
          skippedReason: `channel_scan_failed: ${err?.message || err}`,
        }
      }
    }

    if (channelVideos.length === 0) {
      return { duplicate: false, score: 0, threshold, channelVideosChecked: 0 }
    }

    // 3. Download each channel video & compute/compare signatures
    const scanner = new TikTokScanner()
    let checked = 0
    let bestScore = 0
    let bestMatch: { videoUrl?: string; videoId?: string } = {}

    for (const channelVideo of channelVideos) {
      // Check signature cache first
      const sigCacheKey = `channel:${channelVideo.platform_id}`
      let channelSig: MediaSignature | null = null
      const cachedSig = this.signatureCache.get(sigCacheKey)

      if (cachedSig) {
        if (cachedSig.skippedReason) continue // previously failed, skip
        channelSig = cachedSig.signature
      } else {
        // Download + compute signature
        try {
          log(`Downloading channel video ${channelVideo.platform_id} for comparison...`)
          const videoUrl = channelVideo.download_url
          const { filePath } = await scanner.downloadVideo(videoUrl, channelVideo.platform_id)

          const sigResult: MediaSignatureComputeResult = await computeMediaSignature(filePath).catch((err: any) => ({
            skippedReason: String(err?.message || err),
          }))

          if (sigResult.signature) {
            channelSig = sigResult.signature
            this.signatureCache.set(sigCacheKey, {
              signature: channelSig,
              computedAt: Date.now(),
            })
          } else {
            this.signatureCache.set(sigCacheKey, {
              signature: null,
              computedAt: Date.now(),
              skippedReason: sigResult.skippedReason,
            })
            continue
          }
        } catch (err: any) {
          // Download failed — cache the failure so we don't retry
          this.signatureCache.set(sigCacheKey, {
            signature: null,
            computedAt: Date.now(),
            skippedReason: `download_failed: ${err?.message || err}`,
          })
          continue
        }
      }

      if (!channelSig) continue

      // Compare
      checked++
      const sim = compareMediaSignatures(candidateSigResult.signature, channelSig, threshold)

      if (sim.score > bestScore) {
        bestScore = sim.score
        bestMatch = {
          videoUrl: `https://www.tiktok.com/@${opts.accountUsername}/video/${channelVideo.platform_id}`,
          videoId: channelVideo.platform_id,
        }
      }

      if (sim.duplicate) {
        log(`Channel duplicate found: video ${channelVideo.platform_id} (score=${sim.score.toFixed(3)})`)
        return {
          duplicate: true,
          score: sim.score,
          threshold,
          matchedVideoUrl: bestMatch.videoUrl,
          matchedVideoId: bestMatch.videoId,
          channelVideosChecked: checked,
        }
      }
    }

    log(`No channel duplicates found (checked ${checked} videos, best score=${bestScore.toFixed(3)})`)
    return {
      duplicate: false,
      score: bestScore,
      threshold,
      matchedVideoUrl: bestMatch.videoUrl,
      matchedVideoId: bestMatch.videoId,
      channelVideosChecked: checked,
    }
  }

  /**
   * Clear all caches (e.g. when accounts change)
   */
  static clearCache() {
    this.channelVideoCache.clear()
    this.signatureCache.clear()
  }

  /**
   * Clear cache for a specific account
   */
  static clearAccountCache(username: string) {
    const key = username.replace('@', '').toLowerCase()
    this.channelVideoCache.delete(key)
  }
}

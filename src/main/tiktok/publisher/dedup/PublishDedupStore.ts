import { createHash, randomUUID } from 'crypto'
import { open as openFile } from 'fs/promises'
import { db } from '../../../db/Database'
import type { MediaSignature } from './MediaSimilarity'

export type PublishHistoryRow = {
  id: string
  platform: string
  account_id: string
  account_username?: string
  campaign_id?: string
  source_platform_id?: string
  source_local_path?: string
  file_fingerprint?: string
  caption_hash?: string
  caption_preview?: string
  published_video_id?: string
  published_url?: string
  status: string
  duplicate_reason?: string
  media_signature_json?: string
  media_signature_version?: string
  created_at?: number
  updated_at?: number
}

export type PublishHistoryMatch = PublishHistoryRow

export function normalizeCaptionForDedup(caption: string): string {
  return String(caption || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function hashCaption(caption: string): string | undefined {
  const normalized = normalizeCaptionForDedup(caption)
  if (!normalized) return undefined
  return createHash('sha256').update(normalized).digest('hex')
}

export function captionPreview(caption: string): string {
  return String(caption || '').replace(/\s+/g, ' ').trim().slice(0, 180)
}

export async function computeQuickFileFingerprint(filePath: string): Promise<string | undefined> {
  try {
    const fh = await openFile(filePath, 'r')
    try {
      const stat = await fh.stat()
      const size = Number(stat.size || 0)
      const sampleBytes = 512 * 1024
      const hash = createHash('sha256')
      hash.update(`v1|size:${size}|mtime:${Math.round(Number(stat.mtimeMs || 0))}`)

      const headLen = Math.min(sampleBytes, size)
      if (headLen > 0) {
        const head = Buffer.alloc(headLen)
        const headRes = await fh.read(head, 0, headLen, 0)
        hash.update(head.subarray(0, headRes.bytesRead))
      }

      if (size > sampleBytes) {
        const tailLen = Math.min(sampleBytes, size)
        const tail = Buffer.alloc(tailLen)
        const pos = Math.max(0, size - tailLen)
        const tailRes = await fh.read(tail, 0, tailLen, pos)
        hash.update(tail.subarray(0, tailRes.bytesRead))
      }

      return `fp1:${hash.digest('hex')}`
    } finally {
      await fh.close().catch(() => {})
    }
  } catch {
    return undefined
  }
}

export function findExactDuplicatePublishHistory(accountId: string, sourcePlatformId?: string, fileFingerprint?: string): PublishHistoryMatch | null {
  const signatureClauses: string[] = []
  const signatureParams: any[] = []
  if (sourcePlatformId) {
    signatureClauses.push('source_platform_id = ?')
    signatureParams.push(sourcePlatformId)
  }
  if (fileFingerprint) {
    signatureClauses.push('file_fingerprint = ?')
    signatureParams.push(fileFingerprint)
  }
  if (signatureClauses.length === 0) return null

  const sql = `
    SELECT * FROM publish_history
    WHERE platform = 'tiktok'
      AND account_id = ?
      AND status IN ('under_review', 'published')
      AND (${signatureClauses.join(' OR ')})
    ORDER BY updated_at DESC
    LIMIT 1
  `
  return (db.prepare(sql).get(accountId, ...signatureParams) as PublishHistoryMatch | undefined) || null
}

export function listPublishHistoryCandidates(accountId: string, limit = 25): PublishHistoryRow[] {
  return db.prepare(`
    SELECT * FROM publish_history
    WHERE platform = 'tiktok'
      AND account_id = ?
      AND status IN ('under_review', 'published')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(accountId, Math.max(1, Math.min(200, limit))) as PublishHistoryRow[]
}

export function parseMediaSignatureFromRow(row: { media_signature_json?: string } | null | undefined): MediaSignature | null {
  if (!row?.media_signature_json) return null
  try {
    const parsed = JSON.parse(String(row.media_signature_json))
    if (parsed && parsed.version === 'avsig1') return parsed as MediaSignature
  } catch {}
  return null
}

export function updatePublishHistoryMediaSignature(recordId: string, signature: MediaSignature | null, reason?: string) {
  if (!recordId) return
  try {
    db.prepare(`
      UPDATE publish_history
      SET media_signature_json = COALESCE(?, media_signature_json),
          media_signature_version = COALESCE(?, media_signature_version),
          duplicate_reason = COALESCE(?, duplicate_reason),
          updated_at = ?
      WHERE id = ?
    `).run(
      signature ? JSON.stringify(signature) : null,
      signature?.version || null,
      reason || null,
      Date.now(),
      recordId,
    )
  } catch {}
}

export function insertPublishHistoryRecord(payload: {
  accountId: string
  accountUsername?: string
  campaignId: string
  sourcePlatformId?: string
  sourceLocalPath?: string
  fileFingerprint?: string
  captionHash?: string
  captionPreview?: string
  publishedVideoId?: string
  publishedUrl?: string
  status: 'under_review' | 'published'
  duplicateReason?: string
  mediaSignature?: MediaSignature | null
}): string | null {
  try {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
      INSERT INTO publish_history (
        id, platform, account_id, account_username, campaign_id,
        source_platform_id, source_local_path, file_fingerprint, caption_hash, caption_preview,
        published_video_id, published_url, status, duplicate_reason,
        media_signature_json, media_signature_version,
        created_at, updated_at
      ) VALUES (?, 'tiktok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      payload.accountId,
      payload.accountUsername || null,
      payload.campaignId,
      payload.sourcePlatformId || null,
      payload.sourceLocalPath || null,
      payload.fileFingerprint || null,
      payload.captionHash || null,
      payload.captionPreview || null,
      payload.publishedVideoId || null,
      payload.publishedUrl || null,
      payload.status,
      payload.duplicateReason || null,
      payload.mediaSignature ? JSON.stringify(payload.mediaSignature) : null,
      payload.mediaSignature?.version || null,
      now,
      now,
    )
    return id
  } catch {
    return null
  }
}

export function updatePublishHistoryRecord(recordId: string | null, patch: {
  status?: 'under_review' | 'published'
  publishedVideoId?: string
  publishedUrl?: string
  duplicateReason?: string
  mediaSignature?: MediaSignature | null
}) {
  if (!recordId) return
  try {
    db.prepare(`
      UPDATE publish_history
      SET status = COALESCE(?, status),
          published_video_id = COALESCE(?, published_video_id),
          published_url = COALESCE(?, published_url),
          duplicate_reason = COALESCE(?, duplicate_reason),
          media_signature_json = COALESCE(?, media_signature_json),
          media_signature_version = COALESCE(?, media_signature_version),
          updated_at = ?
      WHERE id = ?
    `).run(
      patch.status || null,
      patch.publishedVideoId || null,
      patch.publishedUrl || null,
      patch.duplicateReason || null,
      patch.mediaSignature ? JSON.stringify(patch.mediaSignature) : null,
      patch.mediaSignature?.version || null,
      Date.now(),
      recordId,
    )
  } catch {}
}


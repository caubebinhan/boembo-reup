import { createHash, randomUUID } from 'node:crypto'
import { open as openFile } from 'fs/promises'
import { publishHistoryRepo } from '../../../db/repositories/PublishHistoryRepo'
import type { PublishHistoryDocument } from '../../../db/models/PublishHistory'
import type { MediaSignature } from './MediaSimilarity'

// ── Pure functions (no DB) ──────────────────────

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

// ── Repository-backed functions ─────────────────

export function findExactDuplicatePublishHistory(
  accountId: string,
  sourcePlatformId?: string,
  fileFingerprint?: string
): PublishHistoryDocument | null {
  return publishHistoryRepo.findExactDuplicate(accountId, sourcePlatformId, fileFingerprint)
}

export function listPublishHistoryCandidates(accountId: string, limit = 25): PublishHistoryDocument[] {
  return publishHistoryRepo.findCandidates(accountId, limit)
}

export function parseMediaSignatureFromRow(row: { media_signature?: any } | null | undefined): MediaSignature | null {
  if (!row?.media_signature) return null
  try {
    const sig = typeof row.media_signature === 'string'
      ? JSON.parse(row.media_signature)
      : row.media_signature
    if (sig && sig.version === 'avsig1') return sig as MediaSignature
  } catch {}
  return null
}

export function updatePublishHistoryMediaSignature(recordId: string, signature: MediaSignature | null, reason?: string) {
  if (!recordId) return
  try {
    const patch: Partial<PublishHistoryDocument> = {
      updated_at: Date.now(),
    }
    if (signature) {
      patch.media_signature = signature
      patch.media_signature_version = signature.version
    }
    if (reason) patch.duplicate_reason = reason
    publishHistoryRepo.patch(recordId, patch)
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
    const now = Date.now()
    const doc: PublishHistoryDocument = {
      id: randomUUID(),
      platform: 'tiktok',
      account_id: payload.accountId,
      account_username: payload.accountUsername,
      campaign_id: payload.campaignId,
      source_platform_id: payload.sourcePlatformId,
      source_local_path: payload.sourceLocalPath,
      file_fingerprint: payload.fileFingerprint,
      caption_hash: payload.captionHash,
      caption_preview: payload.captionPreview,
      published_video_id: payload.publishedVideoId,
      published_url: payload.publishedUrl,
      status: payload.status,
      duplicate_reason: payload.duplicateReason,
      media_signature: payload.mediaSignature || null,
      media_signature_version: payload.mediaSignature?.version,
      created_at: now,
      updated_at: now,
    }
    publishHistoryRepo.save(doc)
    return doc.id
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
    const updates: Partial<PublishHistoryDocument> = { updated_at: Date.now() }
    if (patch.status) updates.status = patch.status
    if (patch.publishedVideoId) updates.published_video_id = patch.publishedVideoId
    if (patch.publishedUrl) updates.published_url = patch.publishedUrl
    if (patch.duplicateReason) updates.duplicate_reason = patch.duplicateReason
    if (patch.mediaSignature) {
      updates.media_signature = patch.mediaSignature
      updates.media_signature_version = patch.mediaSignature.version
    }
    publishHistoryRepo.patch(recordId, updates)
  } catch {}
}

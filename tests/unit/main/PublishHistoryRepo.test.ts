import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDbSchema, db } from '../../../src/main/db/Database'
import { publishHistoryRepo } from '../../../src/main/db/repositories/PublishHistoryRepo'
import type { PublishHistoryDocument } from '../../../src/main/db/models/PublishHistory'

function buildDoc(overrides: Partial<PublishHistoryDocument> = {}): PublishHistoryDocument {
  const now = Date.now()
  return {
    id: overrides.id || 'ph-1',
    platform: 'tiktok',
    account_id: 'acc-1',
    account_username: 'acc_user',
    campaign_id: 'cmp-1',
    source_platform_id: 'src-1',
    source_local_path: '/tmp/video.mp4',
    file_fingerprint: 'fp-1',
    caption_hash: 'caption-hash',
    caption_preview: 'caption',
    published_video_id: 'published-vid',
    published_url: 'https://www.tiktok.com/@acc/video/1',
    status: 'published',
    duplicate_reason: undefined,
    media_signature: null,
    media_signature_version: undefined,
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

beforeEach(() => {
  cleanDbSchema()
})

describe('PublishHistoryRepository', () => {
  it('syncs status index column on save', () => {
    const doc = buildDoc()
    publishHistoryRepo.save(doc)

    const row = db.prepare('SELECT status FROM publish_history WHERE id = ?').get(doc.id) as
      | { status: string | null }
      | undefined

    expect(row?.status).toBe('published')
  })

  it('findExactDuplicate matches legacy row when status index column is null', () => {
    const doc = buildDoc({ id: 'legacy-1', status: 'published' })
    db.prepare(
      `INSERT INTO publish_history (
        id, data_json, account_id, source_platform_id, file_fingerprint, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doc.id,
      JSON.stringify(doc),
      doc.account_id,
      doc.source_platform_id,
      doc.file_fingerprint,
      null,
      doc.created_at,
      doc.updated_at
    )

    const found = publishHistoryRepo.findExactDuplicate(
      doc.account_id,
      doc.source_platform_id,
      undefined
    )
    expect(found?.id).toBe(doc.id)
  })

  it('findCandidates includes legacy row when status index column is null', () => {
    const doc = buildDoc({ id: 'legacy-2', status: 'under_review' })
    db.prepare(
      `INSERT INTO publish_history (
        id, data_json, account_id, source_platform_id, file_fingerprint, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doc.id,
      JSON.stringify(doc),
      doc.account_id,
      doc.source_platform_id,
      doc.file_fingerprint,
      null,
      doc.created_at,
      doc.updated_at
    )

    const candidates = publishHistoryRepo.findCandidates(doc.account_id, 10)
    expect(candidates.some((item) => item.id === doc.id)).toBe(true)
  })
})

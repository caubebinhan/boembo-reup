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
    file_fingerprint: 'fp2:abc123',
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
    ...overrides,
  }
}

beforeEach(() => {
  cleanDbSchema()
})

describe('PublishHistoryRepository', () => {
  // ── Existing tests ──────────────────────────────────

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

  // ── Fingerprint version isolation ───────────────────

  it('fp2 fingerprint does not match fp1', () => {
    // Arrange: insert a row with old fp1 fingerprint
    const doc = buildDoc({ id: 'fp1-row', file_fingerprint: 'fp1:oldcontent' })
    publishHistoryRepo.save(doc)

    // Act: query with new fp2 fingerprint for same content
    const found = publishHistoryRepo.findExactDuplicate('acc-1', undefined, 'fp2:newcontent')

    // Assert: no match (different version prefix = different fingerprint)
    expect(found).toBeNull()
  })

  // ── findExactDuplicate includes uploading ───────────

  it('findExactDuplicate matches uploading status', () => {
    // Arrange: insert a row with uploading status
    const doc = buildDoc({ id: 'uploading-1', status: 'uploading' })
    publishHistoryRepo.save(doc)

    // Act
    const found = publishHistoryRepo.findExactDuplicate('acc-1', 'src-1', undefined)

    // Assert
    expect(found?.id).toBe('uploading-1')
    expect(found?.status).toBe('uploading')
  })

  // ── Claim row pattern ──────────────────────────────

  it('claimForPublish inserts uploading row', () => {
    // Act
    const result = publishHistoryRepo.claimForPublish({
      id: 'claim-1',
      accountId: 'acc-1',
      sourcePlatformId: 'src-new',
      fileFingerprint: 'fp2:unique1',
    })

    // Assert
    expect(result.claimed).toBe(true)
    expect(result.id).toBe('claim-1')

    const row = publishHistoryRepo.findById('claim-1')
    expect(row?.status).toBe('uploading')
    expect(row?.account_id).toBe('acc-1')
    expect(row?.source_platform_id).toBe('src-new')
  })

  it('claimForPublish returns false on conflict (same source_platform_id)', () => {
    // Arrange: first claim succeeds
    publishHistoryRepo.claimForPublish({
      id: 'claim-first',
      accountId: 'acc-1',
      sourcePlatformId: 'src-conflict',
      fileFingerprint: 'fp2:aaa',
    })

    // Act: second claim with same source_platform_id
    const result = publishHistoryRepo.claimForPublish({
      id: 'claim-second',
      accountId: 'acc-1',
      sourcePlatformId: 'src-conflict',
      fileFingerprint: 'fp2:bbb',
    })

    // Assert: rejected by unique partial index
    expect(result.claimed).toBe(false)
  })

  it('claimForPublish returns false on conflict (same file_fingerprint)', () => {
    // Arrange: first claim succeeds
    publishHistoryRepo.claimForPublish({
      id: 'claim-fp-first',
      accountId: 'acc-1',
      sourcePlatformId: 'src-a',
      fileFingerprint: 'fp2:samecontent',
    })

    // Act: second claim with same file_fingerprint but different source
    const result = publishHistoryRepo.claimForPublish({
      id: 'claim-fp-second',
      accountId: 'acc-1',
      sourcePlatformId: 'src-b',
      fileFingerprint: 'fp2:samecontent',
    })

    // Assert: rejected by fingerprint unique partial index
    expect(result.claimed).toBe(false)
  })

  it('removeClaim deletes uploading row, allowing re-claim', () => {
    // Arrange: claim a slot
    publishHistoryRepo.claimForPublish({
      id: 'claim-remove',
      accountId: 'acc-1',
      sourcePlatformId: 'src-retry',
      fileFingerprint: 'fp2:retry',
    })

    // Act: remove the claim
    publishHistoryRepo.removeClaim('claim-remove')

    // Assert: row is gone
    expect(publishHistoryRepo.findById('claim-remove')).toBeNull()

    // Assert: re-claim succeeds
    const reClaim = publishHistoryRepo.claimForPublish({
      id: 'claim-remove-2',
      accountId: 'acc-1',
      sourcePlatformId: 'src-retry',
      fileFingerprint: 'fp2:retry',
    })
    expect(reClaim.claimed).toBe(true)
  })

  it('removeClaim does not delete non-uploading rows', () => {
    // Arrange: save a published row
    const doc = buildDoc({ id: 'published-keep', status: 'published' })
    publishHistoryRepo.save(doc)

    // Act: try to remove it as a claim
    publishHistoryRepo.removeClaim('published-keep')

    // Assert: row still exists (removeClaim only deletes uploading rows)
    expect(publishHistoryRepo.findById('published-keep')).not.toBeNull()
  })

  it('different accounts can claim the same source_platform_id', () => {
    // Arrange: account 1 claims
    const r1 = publishHistoryRepo.claimForPublish({
      id: 'claim-acc1',
      accountId: 'acc-1',
      sourcePlatformId: 'src-shared',
      fileFingerprint: 'fp2:shared',
    })
    expect(r1.claimed).toBe(true)

    // Act: account 2 claims the same source
    const r2 = publishHistoryRepo.claimForPublish({
      id: 'claim-acc2',
      accountId: 'acc-2',
      sourcePlatformId: 'src-shared',
      fileFingerprint: 'fp2:shared',
    })

    // Assert: different accounts are independent
    expect(r2.claimed).toBe(true)
  })
})

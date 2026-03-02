import { BaseRepo } from './BaseRepo'
import type {
  CampaignDocument,
  VideoRecord,
  AlertRecord,
  CampaignCounters,
} from '../models/Campaign'
import type { FlowDefinition } from '@core/flow/ExecutionContracts'

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseObjectOrEmpty(value: unknown): Record<string, any> {
  if (isPlainObject(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function extractImageUrl(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value) return ''
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractImageUrl(item)
      if (url) return url
    }
    return ''
  }
  if (isPlainObject(value)) {
    return (
      extractImageUrl(value.url) ||
      extractImageUrl(value.src) ||
      extractImageUrl(value.href) ||
      extractImageUrl(value.uri) ||
      extractImageUrl(value.url_list) ||
      extractImageUrl(value.urlList) ||
      extractImageUrl(value.urls) ||
      extractImageUrl(value.cover) ||
      extractImageUrl(value.origin_cover) ||
      extractImageUrl(value.originUrl) ||
      extractImageUrl(value.origin_url) ||
      ''
    )
  }
  return ''
}

function normalizeVideoData(raw: unknown): Record<string, any> {
  const data = { ...parseObjectOrEmpty(raw) }
  const normalizedThumbnail = typeof data.thumbnail === 'string'
    ? data.thumbnail
    : (
      extractImageUrl(data.thumbnail) ||
      extractImageUrl(data.cover) ||
      extractImageUrl(data.origin_cover) ||
      extractImageUrl(data.video?.cover) ||
      extractImageUrl(data.video?.origin_cover) ||
      extractImageUrl(data.aweme_detail?.video?.cover) ||
      extractImageUrl(data.aweme_detail?.video?.origin_cover) ||
      ''
    )

  data.thumbnail = normalizedThumbnail
  return data
}

function normalizeVideoRecordInPlace(video: VideoRecord): VideoRecord {
  if (!video || typeof video !== 'object') return video
  video.data = normalizeVideoData(video.data)
  return video
}

function normalizeVideoListInPlace(videos: VideoRecord[]): VideoRecord[] {
  if (!Array.isArray(videos)) return []
  for (const video of videos) normalizeVideoRecordInPlace(video)
  return videos
}

// ���� CampaignStore: mutable wrapper ����������������������������
/**
 * Load a campaign document once, mutate it freely, then call save().
 * No WHERE clauses - videos/alerts/counters live inside the document.
 */
export class CampaignStore {
  constructor(
    public doc: CampaignDocument,
    private repo: CampaignRepository
  ) {
    this.doc.videos = normalizeVideoListInPlace(Array.isArray(this.doc.videos) ? this.doc.videos : [])
  }

  // ���� Videos ��������������������������������������������������������������������
  get videos(): VideoRecord[] {
    this.doc.videos = normalizeVideoListInPlace(Array.isArray(this.doc.videos) ? this.doc.videos : [])
    return this.doc.videos
  }

  findVideo(platformId: string): VideoRecord | undefined {
    const found = this.doc.videos.find(v => v.platform_id === platformId)
    return found ? normalizeVideoRecordInPlace(found) : undefined
  }

  addVideos(videos: VideoRecord[]): void {
    this.doc.videos.push(...normalizeVideoListInPlace(videos))
  }

  setVideos(videos: VideoRecord[]): void {
    this.doc.videos = normalizeVideoListInPlace(videos)
  }

  /**
   * Merge/upsert incoming videos by platform_id.
   *
   * - Existing videos: update data (scan metadata) but preserve runtime
   *   state (status, scheduled_for, publish_url, local_path, queue_index).
   * - New videos: append as-is.
   *
   * Use this instead of setVideos when rescan/monitor should not wipe
   * the status of already-processed videos.
   */
  upsertVideos(incoming: VideoRecord[]): void {
    const existingMap = new Map<string, VideoRecord>()
    for (const v of this.doc.videos) {
      if (v.platform_id) existingMap.set(v.platform_id, v)
    }

    const PRESERVE_KEYS: (keyof VideoRecord)[] = [
      'status', 'scheduled_for', 'publish_url', 'local_path', 'queue_index',
    ]

    for (const inc of normalizeVideoListInPlace(incoming)) {
      const existing = existingMap.get(inc.platform_id)
      if (existing) {
        // Merge scan metadata (data bag) but keep runtime state
        existing.data = { ...existing.data, ...inc.data }
        for (const key of Object.keys(inc) as (keyof VideoRecord)[]) {
          if (PRESERVE_KEYS.includes(key) && existing[key] != null) continue
          if (key === 'data') continue // already merged above
          ;(existing as any)[key] = inc[key]
        }
        normalizeVideoRecordInPlace(existing)
      } else {
        this.doc.videos.push(inc)
        existingMap.set(inc.platform_id, inc)
      }
    }
  }

  updateVideo(platformId: string, patch: Partial<VideoRecord>): void {
    const video = this.findVideo(platformId)
    if (!video) return
    Object.assign(video, patch)
    normalizeVideoRecordInPlace(video)
  }

  videosByStatus(...statuses: string[]): VideoRecord[] {
    return this.doc.videos.filter(v => statuses.includes(v.status))
  }

  // ���� Alerts ��������������������������������������������������������������������
  get alerts(): AlertRecord[] {
    return this.doc.alerts
  }

  addAlert(alert: Omit<AlertRecord, 'created_at'>): void {
    this.doc.alerts.push({ ...alert, created_at: Date.now() })
  }

  // ���� Counters ����������������������������������������������������������������
  get counters(): CampaignCounters {
    return this.doc.counters
  }

  increment(_key: keyof CampaignCounters, _n = 1): void {
    // no-op — counters are recomputed from videos in save()
  }

  setCounter(_key: keyof CampaignCounters, _value: number): void {
    // no-op — counters are recomputed from videos in save()
  }

  /**
   * Derive all counters from the current video array.
   * Called automatically in save() — workflows don't need to manage counters manually.
   *
   * Aggregates videos by status: each unique status becomes a counter key.
   * Also sets `total` = count of all videos.
   * Supports flexible workflows where each workflow defines its own statuses.
   */
  recomputeCounters(): void {
    const counts: CampaignCounters = {} as CampaignCounters
    for (const v of this.doc.videos) {
      const s = v.status || 'unknown'
      counts[s] = (counts[s] || 0) + 1
    }
    counts.total = this.doc.videos.length
    this.doc.counters = counts
  }

  // ���� Meta (extensible bag) ������������������������������������
  get meta(): Record<string, any> {
    return this.doc.meta ?? {}
  }

  setMeta(key: string, value: any): void {
    if (!this.doc.meta) this.doc.meta = {}
    this.doc.meta[key] = value
  }

  // ���� State ����������������������������������������������������������������������
  get lastProcessedIndex(): number {
    return this.doc.last_processed_index
  }

  set lastProcessedIndex(i: number) {
    this.doc.last_processed_index = i
  }

  get status(): string {
    return this.doc.status
  }

  set status(s: string) {
    this.doc.status = s
  }

  get params(): Record<string, any> {
    return this.doc.params
  }

  // ���� Flow ������������������������������������������������������������������������
  get flowSnapshot(): FlowDefinition | null {
    return this.doc.flow_snapshot
  }

  get workflowVersion(): string {
    return this.doc.workflow_version
  }

  // ���� Persist ������������������������������������������������������������������
  save(): void {
    normalizeVideoListInPlace(this.doc.videos)
    this.recomputeCounters()
    this.doc.updated_at = Date.now()
    this.repo.save(this.doc)
  }
}

// ���� CampaignRepository ����������������������������������������������������
export class CampaignRepository extends BaseRepo<CampaignDocument> {
  constructor() {
    super('campaigns')
  }

  /** Open campaign as a mutable CampaignStore */
  open(id: string): CampaignStore {
    const doc = this.findById(id)
    if (!doc) throw new Error(`Campaign ${id} not found`)
    return new CampaignStore(doc, this)
  }

  /** Try to open - returns null if campaign doesn't exist */
  tryOpen(id: string): CampaignStore | null {
    const doc = this.findById(id)
    return doc ? new CampaignStore(doc, this) : null
  }

  findByStatus(...statuses: string[]): CampaignDocument[] {
    return this.findAll().filter(c => statuses.includes(c.status))
  }

  updateStatus(id: string, status: string): void {
    const doc = this.findById(id)
    if (!doc) return
    doc.status = status
    doc.updated_at = Date.now()
    this.save(doc)
  }
}

export const campaignRepo = new CampaignRepository()

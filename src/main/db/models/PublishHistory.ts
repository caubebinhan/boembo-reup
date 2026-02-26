// ── Publish History Document ─────────────────────
export interface PublishHistoryDocument {
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
  media_signature: any
  media_signature_version?: string
  created_at: number
  updated_at: number
}

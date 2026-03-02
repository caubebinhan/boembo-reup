/**
 * Video Status — single source of truth.
 *
 * Define all possible video statuses AND their UI presentation here.
 * The frontend imports STATUS_CONFIG from this file rather than hardcoding.
 * Adding a new status = add one entry here, done.
 */

// ── Video status values ─────────────────────────────────────
export const VIDEO_STATUS = {
  QUEUED: 'queued',
  SCANNED: 'scanned',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  CAPTIONED: 'captioned',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  VERIFICATION_INCOMPLETE: 'verification_incomplete',
  UNDER_REVIEW: 'under_review',
  VERIFYING_PUBLISH: 'verifying_publish',
  DUPLICATE: 'duplicate',
  FAILED: 'failed',
  PUBLISH_FAILED: 'publish_failed',
  CAPTCHA: 'captcha',
  SKIPPED: 'skipped',
  PROCESSING: 'processing',
  PENDING_APPROVAL: 'pending_approval',
} as const

export type VideoStatus = (typeof VIDEO_STATUS)[keyof typeof VIDEO_STATUS]

/** Terminal statuses — no further processing. */
export const TERMINAL_STATUSES: readonly string[] = [
  VIDEO_STATUS.PUBLISHED,
  VIDEO_STATUS.FAILED,
  VIDEO_STATUS.PUBLISH_FAILED,
]

/** Statuses that deduplicator will skip. */
export const DEDUP_SKIP_STATUSES: readonly string[] = [
  VIDEO_STATUS.PUBLISHED,
  'verified',
  VIDEO_STATUS.DOWNLOADED,
  VIDEO_STATUS.UNDER_REVIEW,
  VIDEO_STATUS.VERIFICATION_INCOMPLETE,
  VIDEO_STATUS.DUPLICATE,
  VIDEO_STATUS.CAPTCHA,
  VIDEO_STATUS.PUBLISH_FAILED,
  VIDEO_STATUS.FAILED,
]

// ── UI presentation config ──────────────────────────────────
// Used by detail.tsx, card.tsx, and any component that renders status badges.
// Unknown statuses automatically get a neutral grey fallback.

export interface StatusUIConfig {
  label: string
  color: string
  bg: string
  border: string
}

export const STATUS_UI: Record<string, StatusUIConfig> = {
  queued:                   { label: 'QUEUED',          color: '#ca8a04', bg: '#fefce8', border: '#fde047' },
  scanned:                  { label: 'SCANNED',         color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  downloading:              { label: 'DOWNLOADING',     color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  downloaded:               { label: 'DOWNLOADED',      color: '#0891b2', bg: '#ecfeff', border: '#67e8f9' },
  captioned:                { label: 'CAPTIONED',       color: '#0284c7', bg: '#f0f9ff', border: '#7dd3fc' },
  publishing:               { label: 'PUBLISHING',      color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  published:                { label: 'PUBLISHED',       color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
  verification_incomplete:  { label: 'VERIFY ?',        color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  under_review:             { label: 'UNDER REVIEW',    color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  verifying_publish:        { label: 'VERIFYING',       color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  duplicate:                { label: 'DUPLICATE',       color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  failed:                   { label: 'FAILED',          color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  publish_failed:           { label: 'PUBLISH FAILED',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  captcha:                  { label: '⚠️ CAPTCHA',      color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  skipped:                  { label: 'SKIPPED',         color: '#6b7280', bg: '#f9fafb', border: '#d1d5db' },
  processing:               { label: 'PROCESSING',      color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  pending_approval:         { label: 'PENDING',          color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
}

/** Fallback for any unrecognized status — prevents crashes when new statuses are added. */
export const STATUS_UI_FALLBACK: StatusUIConfig = {
  label: 'UNKNOWN', color: '#6b7280', bg: '#f9fafb', border: '#d1d5db',
}

/** Get UI config for a status, with graceful fallback. */
export function getStatusUI(status: string): StatusUIConfig {
  return STATUS_UI[status] || { ...STATUS_UI_FALLBACK, label: status.toUpperCase().replace(/_/g, ' ') }
}

// ── DB → display status mapping ─────────────────────────────
// Map any DB value to a canonical display status. Unknown values pass through.
const DB_STATUS_MAP: Record<string, string> = {
  pending: 'queued',
  verified: 'published',
  processing: 'downloading',
}

/** Normalize a DB status to a display status. Unknown values pass through unchanged. */
export function mapDbStatus(dbStatus: string): string {
  return DB_STATUS_MAP[dbStatus] || dbStatus
}

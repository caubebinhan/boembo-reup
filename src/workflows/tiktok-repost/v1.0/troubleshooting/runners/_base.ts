/**
 * Runner Base — Shared utilities for troubleshooting case runners
 * ───────────────────────────────────────────────────────────────
 * Extracted from the original basicCases.ts monolith.
 * All per-group runners import from here.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'

// ── Types ─────────────────────────────────────────────

export type Logger = TroubleshootingCaseRunOptions['logger']
export type CheckMap = Record<string, boolean>

export type RunnerHandler = (
  options?: TroubleshootingCaseRunOptions
) => Promise<TroubleshootingRunResultLike | null> | TroubleshootingRunResultLike | null

export type SyntheticGroup = 'campaign' | 'async_verify' | 'compat' | 'recovery' | 'transform' | 'thumbnail' | 'network'

export type SyntheticCaseEvaluation = {
  summary: string
  checks: CheckMap
  result: Record<string, unknown>
  messages?: string[]
  artifacts?: Record<string, unknown>
}

// ── Constants ─────────────────────────────────────────

export const ROOT = process.cwd()

export const FILE_PATHS = {
  STEP2_SOURCES: path.join(ROOT, 'src/renderer/components/wizard/WizardSources.tsx'),
  WIZARD: path.join(ROOT, 'src/workflows/tiktok-repost/v1.0/wizard.ts'),
  SCANNER_NODE: path.join(ROOT, 'src/nodes/tiktok-scanner/backend.ts'),
  DETAIL: path.join(ROOT, 'src/workflows/tiktok-repost/v1.0/detail.tsx'),
  CAMPAIGN_REPO: path.join(ROOT, 'src/main/db/repositories/CampaignRepo.ts'),
  RECOVERY: path.join(ROOT, 'src/workflows/tiktok-repost/v1.0/recovery.ts'),
  DEBUG_DASHBOARD: path.join(ROOT, 'src/renderer/components/debug/DebugDashboard.tsx'),
  DEBUG_STATE: path.join(ROOT, 'src/renderer/components/debug/useDebugState.ts'),
  TEST_PUBLISH: path.join(ROOT, 'src/main/tiktok/publisher/test-publish.ts'),
  TROUBLE_CASES_INDEX: path.join(ROOT, 'src/main/services/troubleshooting/cases/index.ts'),
  WORKFLOW_INDEX: path.join(ROOT, 'tests/debug/WORKFLOW_INDEX.json'),
} as const

export const SYNTHETIC_SCREENSHOT_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFvwJ/l7YQDgAAAABJRU5ErkJggg=='

// ── Logging ───────────────────────────────────────────

export function log(logger: Logger, line: string, level: 'info' | 'warn' | 'error' = 'info') {
  logger?.(line, { level })
}

// ── File Helpers ──────────────────────────────────────

export function safeRead(file: string): string {
  return fs.readFileSync(file, 'utf8')
}

export function lineOf(text: string, needle: string): number | null {
  const idx = text.indexOf(needle)
  if (idx < 0) return null
  return text.slice(0, idx).split('\n').length
}

// ── CheckMap Helpers ─────────────────────────────────

export function logCheckMap(logger: Logger, prefix: string, checks: CheckMap) {
  for (const [key, okFlag] of Object.entries(checks)) {
    log(logger, `[${prefix}] ${key}=${okFlag}`)
  }
}

export function failedChecks(checks: CheckMap): string[] {
  return Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
}

// ── Seeded Random ────────────────────────────────────

export function seededIndex(seed: string | number, length: number): number {
  const text = String(seed)
  let hash = 2166136261 >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash % Math.max(1, length)
}

// ── Result Builders ──────────────────────────────────

export function ok(summary: string, extra: Partial<TroubleshootingRunResultLike> = {}): TroubleshootingRunResultLike {
  return {
    success: true,
    summary,
    ...extra,
  }
}

export function fail(summary: string, extra: Partial<TroubleshootingRunResultLike> = {}): TroubleshootingRunResultLike {
  return {
    success: false,
    summary,
    ...extra,
  }
}

// ── JSON Helpers ─────────────────────────────────────

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function caseSuffix(caseId: string, prefix: string): string {
  return caseId.startsWith(prefix) ? caseId.slice(prefix.length) : caseId
}

export function tokenizeCaseSlug(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)
}

export function buildFixtureIds(caseId: string, count: number): string[] {
  const base = seededIndex(caseId, 10_000)
  return Array.from({ length: count }, (_, idx) => `vid_${base + idx}`)
}

/**
 * Troubleshooting Handler Registry
 * ─────────────────────────────────
 * Maps error codes (DG-xxx) to per-error handler files.
 * Each error code has its own handler file: DG-xxx.handler.ts
 *
 * @module handlers/handler-registry
 * @docusaurus Handler registry reference
 */

export type { HandlerResult, LogFn, HandlerFn } from './types'

/**
 * Handler registry: maps error code → lazy-loaded handler.
 * Each handler file exports `default` as the handler function.
 *
 * @docusaurus-api HANDLER_REGISTRY
 */
const HANDLER_REGISTRY: Record<string, () => Promise<{ default: import('./types').HandlerFn }>> = {
  // ── Infrastructure (DG-00x) ──────────────────
  'DG-001': () => import('./DG-001.handler'),
  'DG-002': () => import('./DG-002.handler'),
  'DG-003': () => import('./DG-003.handler'),
  'DG-006': () => import('./DG-006.handler'),
  'DG-010': () => import('./DG-010.handler'),

  // ── Publish (DG-1xx) ─────────────────────────
  'DG-100': () => import('./DG-100.handler'),
  'DG-101': () => import('./DG-101.handler'),
  'DG-103': () => import('./DG-103.handler'),
  'DG-110': () => import('./DG-110.handler'),
  'DG-113': () => import('./DG-113.handler'),
  'DG-115': () => import('./DG-115.handler'),
  'DG-131': () => import('./DG-131.handler'),

  // ── Scanner (DG-2xx) ─────────────────────────
  'DG-200': () => import('./DG-200.handler'),
  'DG-202': () => import('./DG-202.handler'),
  'DG-203': () => import('./DG-203.handler'),
  'DG-210': () => import('./DG-210.handler'),

  // ── Video Edit (DG-6xx) ──────────────────────
  'DG-610': () => import('./DG-610.handler'),
}

/**
 * Run a troubleshooting handler by error code.
 * Returns null if handler is not registered.
 *
 * @param errorCode The DG-xxx error code
 * @param logger Log function for progress messages
 *
 * @example
 * ```typescript
 * const result = await runHandler('DG-001', console.log)
 * // result.success → true/false
 * // result.title → "FFmpeg hoạt động bình thường"
 * ```
 */
export async function runHandler(errorCode: string, logger: (msg: string) => void): Promise<import('./types').HandlerResult | null> {
  const loader = HANDLER_REGISTRY[errorCode]
  if (!loader) return null

  const mod = await loader()
  return mod.default(logger)
}

/** List all registered error codes with handlers */
export function listHandlerIds(): string[] {
  return Object.keys(HANDLER_REGISTRY)
}

/** Check if an error code has a handler */
export function hasHandler(errorCode: string): boolean {
  return errorCode in HANDLER_REGISTRY
}

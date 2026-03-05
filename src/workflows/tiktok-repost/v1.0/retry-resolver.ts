/**
 * TikTok Repost — Retry Resolver
 * ─────────────────────────────────────────────────
 * Given a video's current state + runtime context, resolve which
 * node instanceId should be retried.
 *
 * Centralizes the status→node mapping that was previously hardcoded
 * in detail.tsx. Keeps UI generic — UI calls resolveRetryNode()
 * and passes the result to the engine.
 *
 * Context-aware: uses lastFailedNode from meta.runtime as fallback
 * instead of blindly mapping generic 'failed' to 'publisher_1'.
 */

export interface RetryContext {
  status: string
  errorType?: string
  lastFailedNode?: string    // from meta.runtime.lastCompletedNode or error logs
  lastActiveNode?: string    // from meta.runtime.currentNode
}

/** Explicit status → node mapping */
const STATUS_NODE_MAP: Record<string, string> = {
  publish_failed: 'publisher_1',
  captcha: 'publisher_1',
  download_failed: 'downloader_1',
  scan_failed: 'scanner_1',
  edit_failed: 'video_edit_1',
  caption_failed: 'caption_1',
}

/**
 * Resolve which node to retry for a given video context.
 *
 * Priority:
 * 1. Explicit status mapping (e.g. publish_failed → publisher_1)
 * 2. Runtime context: lastFailedNode from meta.runtime
 * 3. null (cannot determine — UI should show "Retry không khả dụng")
 */
export function resolveRetryNode(ctx: RetryContext): string | null {
  // 1. Explicit mapping
  const mapped = STATUS_NODE_MAP[ctx.status]
  if (mapped) return mapped

  // 2. Fallback: lastFailedNode from runtime or lastActiveNode
  if (ctx.lastFailedNode) return ctx.lastFailedNode
  if (ctx.lastActiveNode) return ctx.lastActiveNode

  // 3. Cannot determine
  return null
}

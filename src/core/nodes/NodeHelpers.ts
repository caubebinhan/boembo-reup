import { NodeExecutionContext, NodeExecutionResult } from './NodeDefinition'
import { ExecutionLogger } from '../engine/ExecutionLogger'

/**
 * Shared node helpers — DRY utilities for common node operations.
 * Import from '@core/nodes/NodeHelpers' in any node backend.
 */

/**
 * Gracefully fail a video — sets status to 'failed', emits a typed event, returns { action: 'continue' }.
 * Use this instead of `throw new Error(...)` when failure should NOT crash the loop.
 *
 * @param ctx          Node execution context
 * @param instanceId   The node instance ID for event scoping (e.g. 'publisher_1', 'downloader_1')
 * @param platformId   Video platform_id (or fallback string)
 * @param errorType    Machine-readable error category (e.g. 'file_not_found', 'no_account')
 * @param message      Human-readable error description
 * @param opts         Optional: errorCode (DG-xxx), retryable flag, extra event fields
 */
export function failGracefully(
  ctx: NodeExecutionContext,
  instanceId: string,
  platformId: string,
  errorType: string,
  message: string,
  opts?: { errorCode?: string; retryable?: boolean; extra?: Record<string, any> }
): NodeExecutionResult {
  const errorCode = opts?.errorCode
  const logMsg = errorCode ? `[${errorCode}] ${message}` : message
  ctx.logger.error(logMsg)

  // Update video status if we have a valid platform_id
  if (platformId && platformId !== 'unknown') {
    try {
      ctx.store.updateVideo(platformId, { status: 'failed' })
      ctx.store.save()
    } catch (err) {
      ctx.logger.error(`[failGracefully] Could not update video status`, err)
    }
  }

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, instanceId, 'node:failed', {
    videoId: platformId,
    error: message,
    errorType,
    errorCode,
    retryable: opts?.retryable ?? false,
    ...opts?.extra,
  })

  return { action: 'continue', data: null, message: logMsg }
}

/**
 * Gracefully fail a batch/source node — logs error and returns empty data.
 * Use for source nodes (scanner, file-source) that produce arrays instead of single videos.
 *
 * @param ctx          Node execution context
 * @param instanceId   The node instance ID
 * @param errorType    Machine-readable error category
 * @param message      Human-readable error description
 * @param opts         Optional: errorCode (DG-xxx), retryable flag
 */
export function failBatchGracefully(
  ctx: NodeExecutionContext,
  instanceId: string,
  errorType: string,
  message: string,
  opts?: { errorCode?: string; retryable?: boolean }
): NodeExecutionResult {
  const errorCode = opts?.errorCode
  const logMsg = errorCode ? `[${errorCode}] ${message}` : message
  ctx.logger.error(logMsg)

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, instanceId, 'node:failed', {
    error: message,
    errorType,
    errorCode,
    retryable: opts?.retryable ?? false,
  })

  return { action: 'continue', data: [], message: logMsg }
}

/**
 * Safely update a video's status + persist. Swallows errors so a DB failure doesn't crash the node.
 */
export function setVideoStatus(
  ctx: NodeExecutionContext,
  platformId: string,
  status: string,
  publishUrl?: string,
  dataPatch?: Record<string, any>
) {
  try {
    const video = ctx.store.findVideo(platformId)
    const mergedData = dataPatch && video ? { ...video.data, ...dataPatch } : undefined
    ctx.store.updateVideo(platformId, {
      status,
      publish_url: publishUrl || undefined,
      ...(mergedData ? { data: mergedData } : {}),
    })
    ctx.store.save()
  } catch (err) {
    ctx.logger.error(`Failed to update video status to ${status}`, err)
  }
}

/**
 * Detect network/connectivity errors from exception messages.
 * Returns true if the error indicates a host-unreachable / DNS / connection failure.
 * Used by FlowEngine to auto-pause campaigns on network outages.
 */
export function isNetworkError(errorMsg: string): boolean {
  if (!errorMsg) return false
  const lower = errorMsg.toLowerCase()
  const patterns = [
    'enotfound',          // DNS resolution failed
    'econnrefused',       // Connection refused
    'econnreset',         // Connection reset
    'econnaborted',       // Connection aborted
    'etimedout',          // Connection timed out
    'enetunreach',        // Network unreachable
    'ehostunreach',       // Host unreachable
    'epipe',              // Broken pipe
    'net::err_',          // Chromium/Playwright network errors
    'err_name_not_resolved',
    'err_connection_refused',
    'err_connection_timed_out',
    'err_internet_disconnected',
    'err_network_changed',
    'network error',
    'fetch failed',
    'socket hang up',
    'getaddrinfo',        // DNS lookup failure
    'connect etimedout',
    'request to .* failed',
  ]
  return patterns.some(p => lower.includes(p))
}

/**
 * Detect disk/storage errors from exception messages.
 * Returns true if the error indicates a disk-full / permission / IO failure.
 * Used by FlowEngine to auto-fail campaigns on storage issues.
 */
export function isDiskError(errorMsg: string): boolean {
  if (!errorMsg) return false
  const lower = errorMsg.toLowerCase()
  const patterns = [
    'enospc',             // No space left on device
    'enomem',             // Out of memory
    'erofs',              // Read-only file system
    'eacces',             // Permission denied (file system)
    'eperm',              // Operation not permitted
    'emfile',             // Too many open files
    'enfile',             // File table overflow
    'eio',                // I/O error
    'disk full',
    'no space left',
    'not enough space',
    'insufficient disk',
    'write error',
    'cannot write',
    'disk quota exceeded',
    'edquot',             // Disk quota exceeded
  ]
  return patterns.some(p => lower.includes(p))
}

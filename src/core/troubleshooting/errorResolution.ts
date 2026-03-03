/**
 * Error Resolution — Thin Wrapper
 * ────────────────────────────────
 * Reads from the unified error-codes.ts registry.
 * Provides backward-compatible API for NodeErrorModal and UI components.
 *
 * @module errorResolution
 * @see {@link error-codes.ts} for the single source of truth
 * @docusaurus Use this module as the source for the "Error Reference" docs page
 */
import { ERROR_CODE_MAP, type ErrorCodeMeta } from './error-codes'

/**
 * User-facing error resolution guidance.
 * Backward-compatible interface — now sourced from ErrorCodeMeta.
 *
 * @docusaurus-schema ErrorResolution
 */
export interface ErrorResolution {
  /** DG-xxx error code */
  errorCode: string
  /** User-friendly title (Vietnamese) */
  userTitle: string
  /** Root cause explanation for non-technical users */
  cause: string
  /** Step-by-step solutions */
  solutions: string[]
  /** Troubleshoot handler ID (for auto-run) */
  troubleshootHandler?: string
  /** Visual severity level */
  severity: 'critical' | 'warning' | 'info'
  /** Whether user can retry this operation */
  retryable: boolean
  /** Whether user can skip this node and continue */
  skippable: boolean
  /** Icon for the error type */
  icon: string
}

/** Map ErrorCodeMeta severity to ErrorResolution severity */
function toResolutionSeverity(sev: string): 'critical' | 'warning' | 'info' {
  if (sev === 'critical' || sev === 'high') return 'critical'
  if (sev === 'medium') return 'warning'
  return 'info'
}

/** Convert ErrorCodeMeta → ErrorResolution */
function toResolution(meta: ErrorCodeMeta): ErrorResolution {
  return {
    errorCode: meta.code,
    userTitle: meta.title,
    cause: meta.cause,
    solutions: meta.solutions,
    troubleshootHandler: meta.troubleshootHandler,
    severity: toResolutionSeverity(meta.severity),
    retryable: meta.retryable,
    skippable: meta.skippable,
    icon: meta.icon,
  }
}

/**
 * Default fallback resolution for unknown error codes.
 */
const FALLBACK_RESOLUTION: ErrorResolution = {
  errorCode: 'DG-000',
  userTitle: 'Đã xảy ra lỗi',
  cause: 'Hệ thống gặp một lỗi không xác định. Đây có thể là lỗi tạm thời.',
  solutions: [
    'Thử bấm Retry để chạy lại',
    'Nếu lỗi tiếp tục, bấm Kiểm tra để chẩn đoán hệ thống',
    'Ghi lại mã lỗi và liên hệ hỗ trợ nếu cần',
  ],
  severity: 'warning',
  retryable: true,
  skippable: true,
  icon: '⚠️',
}

/**
 * Look up user-friendly error resolution for a DG-xxx code.
 * Now reads from the unified error-codes.ts registry.
 *
 * @param errorCode The DG-xxx error code
 * @returns ErrorResolution with user-facing guidance
 *
 * @example
 * ```typescript
 * const resolution = getErrorResolution('DG-101')
 * // resolution.userTitle → "TikTok hiện CAPTCHA"
 * // resolution.solutions → ["Bấm Giải CAPTCHA...", ...]
 * ```
 *
 * @docusaurus-api getErrorResolution
 */
export function getErrorResolution(errorCode?: string): ErrorResolution {
  if (!errorCode) return FALLBACK_RESOLUTION
  const meta = ERROR_CODE_MAP.get(errorCode)
  if (meta) return toResolution(meta)
  return {
    ...FALLBACK_RESOLUTION,
    errorCode,
    userTitle: `Lỗi ${errorCode}`,
    cause: `Hệ thống gặp lỗi mã ${errorCode}. Chi tiết lỗi hiển thị bên dưới.`,
  }
}

/**
 * Try to detect error code from error message string.
 * Scans for [DG-xxx] pattern in the message.
 */
export function extractErrorCodeFromMessage(message: string): string | undefined {
  const match = message.match(/\[?(DG-\d{3})\]?/)
  return match?.[1]
}

/** All registered resolutions (for docs generation) */
export const ERROR_RESOLUTIONS: readonly ErrorResolution[] = Object.freeze(
  [...ERROR_CODE_MAP.values()].map(toResolution)
)

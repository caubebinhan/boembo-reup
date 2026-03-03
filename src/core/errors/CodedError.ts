/**
 * @module core/errors
 * @description Standardized error class with diagnostic code.
 *
 * Every exception in the system should use CodedError instead of raw Error.
 * The error code is prefixed in the message for easy grep/trace in logs,
 * Sentry, and AI-assisted debugging.
 *
 * @example
 * ```ts
 * throw new CodedError('DG-010', 'FFmpeg binary not found on PATH')
 * // → Error: [DG-010] FFmpeg binary not found on PATH
 * ```
 *
 * @docCategory Core Infrastructure
 */

/**
 * Application error carrying an immutable diagnostic code (DG-xxx).
 *
 * Codes are registered in `core/troubleshooting/error-codes.ts`.
 * Once a code is published it must never be reused or change meaning.
 */
export class CodedError extends Error {
  /** Immutable diagnostic code, e.g. 'DG-010' */
  public readonly errorCode: string

  /** Original cause (for error chaining) */
  public readonly cause?: unknown

  constructor(errorCode: string, message: string, cause?: unknown) {
    super(`[${errorCode}] ${message}`)
    this.name = 'CodedError'
    this.errorCode = errorCode
    this.cause = cause
  }
}

/**
 * Factory shorthand: `coded('DG-010', 'msg')` → `new CodedError('DG-010', 'msg')`
 */
export function coded(errorCode: string, message: string, cause?: unknown): CodedError {
  return new CodedError(errorCode, message, cause)
}

/**
 * Type guard: check if an unknown value is a CodedError.
 */
export function isCodedError(err: unknown): err is CodedError {
  return err instanceof CodedError
}

/**
 * Extract errorCode from any error — returns code if CodedError, undefined otherwise.
 */
export function extractErrorCode(err: unknown): string | undefined {
  if (err instanceof CodedError) return err.errorCode
  return undefined
}

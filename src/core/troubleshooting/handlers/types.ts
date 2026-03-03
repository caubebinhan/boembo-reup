/**
 * Shared types for troubleshooting handlers.
 * @module handlers/types
 */
export interface HandlerResult {
  success: boolean
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

export type LogFn = (msg: string) => void
export type HandlerFn = (logger: LogFn) => Promise<HandlerResult>

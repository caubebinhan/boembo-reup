/**
 * SentryAutoReporter — Auto-report failed troubleshooting runs to Sentry.
 * ────────────────────────────────────────────────────────────────────────
 * Features:
 *   • Rate limiter: max N events per window (prevents spam on Run All)
 *   • Dedupe by errorCode: same errorCode within cooldown → skipped
 *   • Opt-out toggle: users can disable auto-reporting
 *   • Returns SentryAutoResult for UI feedback
 */

// ── Types ────────────────────────────────────────────

export interface SentryAutoConfig {
  /** Whether auto-reporting is enabled. Default: true */
  enabled: boolean
  /** Max events allowed per time window. Default: 5 */
  maxEventsPerWindow: number
  /** Time window in ms for rate limiting. Default: 60_000 (1 min) */
  windowMs: number
  /** Cooldown per errorCode in ms. Default: 300_000 (5 min) */
  dedupeWindowMs: number
}

export interface SentryAutoResult {
  /** Whether the event was actually sent */
  sent: boolean
  /** Skip reason if not sent */
  skipReason?: 'disabled' | 'rate_limited' | 'dedupe_cooldown' | 'no_error_code' | 'not_failed'
  /** Event ID if sent successfully */
  eventId?: string | null
  /** Human-readable message */
  message: string
  /** Error code that was (or would be) reported */
  errorCode?: string
}

export interface SentryAutoRunPayload {
  runId: string
  caseId: string
  title: string
  status: string
  errorCode?: string
  summary?: string
  logs?: Array<{ ts: number; level: string; line: string }>
  result?: any
  failure?: any
}

// ── Default config ───────────────────────────────────

const DEFAULT_CONFIG: SentryAutoConfig = {
  enabled: true,
  maxEventsPerWindow: 5,
  windowMs: 60_000,
  dedupeWindowMs: 300_000,
}

// ── Rate limiter state ───────────────────────────────

interface RateLimiterState {
  /** Timestamps of recent sends within current window */
  recentSends: number[]
  /** Map of errorCode → last send timestamp for deduplication */
  lastSendByCode: Map<string, number>
}

// ── Class ────────────────────────────────────────────

export class SentryAutoReporter {
  private config: SentryAutoConfig
  private state: RateLimiterState
  private sendFn: (payload: SentryAutoRunPayload) => Promise<{ eventId?: string | null; message?: string } | null>

  constructor(
    sendFn: (payload: SentryAutoRunPayload) => Promise<{ eventId?: string | null; message?: string } | null>,
    config?: Partial<SentryAutoConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.state = {
      recentSends: [],
      lastSendByCode: new Map(),
    }
    this.sendFn = sendFn
  }

  // ── Public API ──────────────────────────────────

  /** Toggle auto-reporting on/off */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  /** Update config at runtime */
  updateConfig(patch: Partial<SentryAutoConfig>): void {
    Object.assign(this.config, patch)
  }

  /** Get current stats for UI display */
  getStats(): { recentCount: number; windowMs: number; maxPerWindow: number; dedupeCount: number } {
    this.pruneWindow()
    return {
      recentCount: this.state.recentSends.length,
      windowMs: this.config.windowMs,
      maxPerWindow: this.config.maxEventsPerWindow,
      dedupeCount: this.state.lastSendByCode.size,
    }
  }

  /** Reset all rate limiting state */
  reset(): void {
    this.state.recentSends = []
    this.state.lastSendByCode.clear()
  }

  /**
   * Attempt to auto-report a failed run.
   * Returns immediately if rate-limited, deduped, or disabled.
   */
  async report(payload: SentryAutoRunPayload): Promise<SentryAutoResult> {
    const { errorCode } = payload

    // 1. Opt-out check
    if (!this.config.enabled) {
      return { sent: false, skipReason: 'disabled', message: 'Auto-Sentry disabled', errorCode }
    }

    // 2. Only report failures
    if (payload.status !== 'failed') {
      return { sent: false, skipReason: 'not_failed', message: 'Run did not fail — skipped', errorCode }
    }

    // 3. Require errorCode for meaningful tracking
    if (!errorCode) {
      return { sent: false, skipReason: 'no_error_code', message: 'No errorCode — skipped (assign DG-xxx)', errorCode }
    }

    // 4. Dedupe by errorCode
    const now = Date.now()
    const lastSend = this.state.lastSendByCode.get(errorCode)
    if (lastSend && (now - lastSend) < this.config.dedupeWindowMs) {
      const remainingSec = Math.ceil((this.config.dedupeWindowMs - (now - lastSend)) / 1000)
      return {
        sent: false,
        skipReason: 'dedupe_cooldown',
        message: `${errorCode} reported ${remainingSec}s ago — skipped (dedupe)`,
        errorCode,
      }
    }

    // 5. Rate limit
    this.pruneWindow()
    if (this.state.recentSends.length >= this.config.maxEventsPerWindow) {
      return {
        sent: false,
        skipReason: 'rate_limited',
        message: `Rate limit: ${this.config.maxEventsPerWindow} events per ${this.config.windowMs / 1000}s window`,
        errorCode,
      }
    }

    // 6. Send
    try {
      const result = await this.sendFn(payload)
      this.state.recentSends.push(now)
      this.state.lastSendByCode.set(errorCode, now)

      return {
        sent: true,
        eventId: result?.eventId,
        message: result?.message || `Sent ${errorCode} to Sentry`,
        errorCode,
      }
    } catch (err: any) {
      return {
        sent: false,
        message: `Sentry send failed: ${err?.message || String(err)}`,
        errorCode,
      }
    }
  }

  // ── Private ─────────────────────────────────────

  private pruneWindow(): void {
    const cutoff = Date.now() - this.config.windowMs
    this.state.recentSends = this.state.recentSends.filter(ts => ts > cutoff)

    // Also prune old dedupe entries
    const dedupeCutoff = Date.now() - this.config.dedupeWindowMs
    for (const [code, ts] of this.state.lastSendByCode) {
      if (ts < dedupeCutoff) this.state.lastSendByCode.delete(code)
    }
  }
}

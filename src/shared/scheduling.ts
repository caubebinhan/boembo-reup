/**
 * @shared/scheduling.ts
 *
 * SINGLE SOURCE OF TRUTH for schedule slot computation.
 * Used by: wizard preview (renderer), video-scheduler (main), recovery (main).
 *
 * Pure functions — no Node.js deps, no side effects, importable everywhere.
 */

export interface TimeRange {
  days: number[]
  start: string // "HH:mm"
  end: string   // "HH:mm"
}

export interface ScheduleSlotOptions {
  /** Start cursor (ms timestamp). Default: Date.now() */
  cursor?: number
  /** Gap between videos in minutes */
  publishIntervalMinutes: number
  /** Apply ±50% random jitter to gap */
  publishJitterEnabled?: boolean
  /** Daily active hour windows */
  ranges: TimeRange[]
  /** Number of slots to compute */
  count: number
  /**
   * Deterministic seed for jitter (for UI preview stability).
   * If omitted, uses Math.random().
   */
  seed?: number
}

export interface ScheduleSlot {
  /** ms timestamp of this slot */
  timestamp: number
  /** Actual gap from previous slot in ms (undefined for first) */
  gapMs?: number
}

/**
 * Parse "HH:mm" → minutes since midnight.
 */
function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Is `date` within any of the configured time ranges?
 */
export function isWithinAnyRange(date: Date, ranges: TimeRange[]): boolean {
  const day = date.getDay()
  const mins = date.getHours() * 60 + date.getMinutes()
  return ranges.some(r => r.days.includes(day) && mins >= parseHHMM(r.start) && mins <= parseHHMM(r.end))
}

/**
 * Find the next valid timestamp >= `fromMs` that falls within any range.
 * Steps forward by scanning days and range windows.
 */
export function nextValidSlot(fromMs: number, ranges: TimeRange[]): number {
  const d = new Date(fromMs)
  if (isWithinAnyRange(d, ranges)) return fromMs

  // Step through next 8 days looking for a valid slot
  for (let off = 0; off <= 7; off++) {
    for (const r of ranges) {
      const candidate = new Date(fromMs)
      candidate.setDate(candidate.getDate() + off)
      if (!r.days.includes(candidate.getDay())) continue

      const startMin = parseHHMM(r.start)
      candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)

      if (candidate.getTime() >= fromMs) return candidate.getTime()
    }
  }

  // Fallback: 24h later
  return fromMs + 24 * 60 * 60 * 1000
}

/**
 * Compute N schedule slots, respecting daily time ranges, interval, and jitter.
 *
 * This is the SINGLE function used everywhere:
 * - Wizard preview (renderer)
 * - VideoScheduler node (initial scheduling)
 * - Recovery service (reschedule missed videos)
 */
export function computeScheduleSlots(opts: ScheduleSlotOptions): ScheduleSlot[] {
  const intervalMs = opts.publishIntervalMinutes * 60_000
  let cursor = opts.cursor ?? Date.now()
  let seed = opts.seed ?? -1 // -1 = use Math.random()
  const slots: ScheduleSlot[] = []

  for (let i = 0; i < opts.count; i++) {
    cursor = nextValidSlot(cursor, opts.ranges)
    const prevCursor = i > 0 ? slots[i - 1].timestamp : undefined

    slots.push({
      timestamp: cursor,
      gapMs: prevCursor != null ? cursor - prevCursor : undefined,
    })

    // Apply jitter
    let jitterFactor = 1
    if (opts.publishJitterEnabled) {
      if (seed >= 0) {
        // Deterministic pseudo-random (for stable preview)
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        jitterFactor = 0.5 + (seed % 1000) / 1000
      } else {
        jitterFactor = 0.5 + Math.random()
      }
    }
    cursor += Math.round(intervalMs * jitterFactor)
  }

  return slots
}

/**
 * Convenience: compute slots and return as [{platform_id, scheduled_for}].
 * Used by video-scheduler and recovery (which operate on video arrays).
 */
export function scheduleVideos(
  videos: { platform_id: string;[key: string]: any }[],
  opts: Omit<ScheduleSlotOptions, 'count'>
): { platform_id: string; scheduled_for: number }[] {
  const slots = computeScheduleSlots({ ...opts, count: videos.length })
  return videos.map((v, i) => ({
    platform_id: v.platform_id,
    scheduled_for: slots[i].timestamp,
  }))
}

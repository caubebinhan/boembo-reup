/**
 * Shared time-window utilities — supports MULTIPLE time ranges.
 *
 * TimeRange: { days: number[], start: "HH:mm", end: "HH:mm" }
 *   - days: 0=Sun, 1=Mon ... 6=Sat
 *   - start/end: "HH:mm" strings
 */

export interface TimeRange {
  days: number[]      // 0=Sun … 6=Sat
  start: string       // "HH:mm"
  end: string         // "HH:mm"
}

/** Parse "HH:mm" → total minutes from midnight */
export function toMinutes(t: string): number {
  const parts = String(t || '00:00').split(':').map(Number)
  return (parts[0] || 0) * 60 + (parts[1] || 0)
}

/** Normalize activeDays to a reliable number array */
function normalizeDays(days: any): number[] {
  if (Array.isArray(days)) return days.map(Number)
  if (typeof days === 'string') {
    try { return JSON.parse(days).map(Number) } catch { return [0, 1, 2, 3, 4, 5, 6] }
  }
  return [0, 1, 2, 3, 4, 5, 6]
}

/**
 * Normalize campaign params into a TimeRange[].
 * Returns 24/7 default if params.activeWindows is not set.
 */
export function normalizeTimeRanges(params: Record<string, any>): TimeRange[] {
  if (params.activeWindows && Array.isArray(params.activeWindows) && params.activeWindows.length > 0) {
    return params.activeWindows.map((r: any) => ({
      days: normalizeDays(r.days),
      start: r.start || '00:00',
      end: r.end || '23:59',
    }))
  }
  // Default: 24/7
  return [{ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }]
}

/**
 * Check whether a given Date falls inside ANY of the time ranges.
 */
export function isWithinAnyWindow(date: Date, ranges: TimeRange[]): boolean {
  const day = date.getDay()
  const nowMin = date.getHours() * 60 + date.getMinutes()

  for (const r of ranges) {
    if (!r.days.includes(day)) continue
    const startMin = toMinutes(r.start)
    const endMin = toMinutes(r.end)
    if (nowMin >= startMin && nowMin <= endMin) return true
  }
  return false
}

/**
 * Given a timestamp, return the NEXT valid slot (ms) within any of the time ranges.
 *
 * Algorithm:
 * 1. If the timestamp is already valid → return as-is.
 * 2. Collect all candidate start times within the next 7 days.
 * 3. Return the earliest candidate that is >= timestamp.
 */
export function nextValidSlot(
  timestamp: number,
  ranges: TimeRange[]
): number {

  // Already valid?
  const from = new Date(timestamp)
  if (isWithinAnyWindow(from, ranges)) return timestamp

  // Find the earliest start slot across all ranges within next 7 days
  let bestMs = Infinity

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(timestamp)
    candidate.setDate(candidate.getDate() + dayOffset)

    for (const r of ranges) {
      if (!r.days.includes(candidate.getDay())) continue

      const startMin = toMinutes(r.start)
      const endMin = toMinutes(r.end)

      // Build exact start time for this day
      const slotDate = new Date(candidate)
      slotDate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
      const slotMs = slotDate.getTime()

      // Only accept if it's in the future and within end
      if (slotMs < timestamp) {
        // Same day but start is already past; check if we're still inside the window
        const nowMin = from.getHours() * 60 + from.getMinutes()
        if (dayOffset === 0 && nowMin <= endMin) {
          // We're mid-window but nextValidSlot said not valid — shouldn't happen
          // but return now just in case
          if (slotMs < bestMs) bestMs = timestamp
        }
        continue
      }

      if (slotMs < bestMs) bestMs = slotMs
    }
  }

  return bestMs === Infinity ? timestamp + 24 * 60 * 60 * 1000 : bestMs
}

/**
 * Shared reschedule helper — slides an array of videos forward from a cursor,
 * respecting time ranges (daily slots), interval, and optional jitter.
 *
 * Returns the rescheduled timestamps (does NOT mutate input).
 * Consumers should apply the returned timestamps to their store.
 */
export function rescheduleFromNow(
  videos: { platform_id: string; [key: string]: any }[],
  opts: {
    cursor?: number
    publishIntervalMinutes: number
    publishJitterEnabled?: boolean
    ranges: TimeRange[]
  }
): { platform_id: string; scheduled_for: number }[] {
  const intervalMs = opts.publishIntervalMinutes * 60_000
  let cursor = opts.cursor ?? Date.now()

  return videos.map(v => {
    cursor = nextValidSlot(cursor, opts.ranges)
    const scheduled_for = cursor
    const jitteredInterval = opts.publishJitterEnabled
      ? intervalMs * (0.5 + Math.random())
      : intervalMs
    cursor += jitteredInterval
    return { platform_id: v.platform_id, scheduled_for }
  })
}



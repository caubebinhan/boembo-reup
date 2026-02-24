/**
 * Shared time-window utilities — supports MULTIPLE time ranges.
 *
 * TimeRange: { days: number[], start: "HH:mm", end: "HH:mm" }
 *   - days: 0=Sun, 1=Mon ... 6=Sat
 *   - start/end: "HH:mm" strings
 *
 * Legacy single-window support: if params use `activeHoursStart`/`activeHoursEnd`/`activeDays`,
 * they are normalised into the new multi-range format automatically.
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
 *
 * Accepts two formats:
 *   A) New multi-range: params.timeRanges = TimeRange[]
 *   B) Legacy single:   params.activeHoursStart + params.activeHoursEnd + params.activeDays
 *
 * Falls back to 24/7 if nothing is set.
 */
export function normalizeTimeRanges(params: Record<string, any>): TimeRange[] {
  // Format A — explicit multi-range
  if (params.timeRanges && Array.isArray(params.timeRanges) && params.timeRanges.length > 0) {
    return params.timeRanges.map((r: any) => ({
      days: normalizeDays(r.days),
      start: r.start || '00:00',
      end: r.end || '23:59',
    }))
  }

  // Format B — legacy single window
  const start = params.activeHoursStart ?? params.schedule?.start_time ?? '00:00'
  const end = params.activeHoursEnd ?? params.schedule?.end_time ?? '23:59'
  const days = normalizeDays(params.activeDays ?? params.schedule?.active_days ?? [0, 1, 2, 3, 4, 5, 6])
  return [{ days, start, end }]
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
  rangesOrStart: TimeRange[] | string,
  activeEnd?: string,
  activeDays?: number[] | any
): number {
  // Backwards-compatible overload: accept (ts, start, end, days)
  let ranges: TimeRange[]
  if (typeof rangesOrStart === 'string') {
    ranges = [{
      days: normalizeDays(activeDays ?? [0, 1, 2, 3, 4, 5, 6]),
      start: rangesOrStart,
      end: activeEnd ?? '23:59',
    }]
  } else {
    ranges = rangesOrStart
  }

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

// ── Legacy single-window compat exports ───────────────────────────────────
/** @deprecated Use isWithinAnyWindow with normalizeTimeRanges instead */
export function isWithinWindow(
  date: Date,
  activeStart: string,
  activeEnd: string,
  activeDays: number[] | any
): boolean {
  return isWithinAnyWindow(date, [{ days: normalizeDays(activeDays), start: activeStart, end: activeEnd }])
}

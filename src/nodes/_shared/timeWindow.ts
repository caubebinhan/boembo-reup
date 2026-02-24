/**
 * Shared time-window utilities for VideoScheduler & CheckInTime nodes.
 *
 * activeHoursStart / activeHoursEnd: "HH:mm" strings (e.g. "07:00", "23:00")
 * activeDays: array of day-of-week numbers, 0=Sun … 6=Sat
 */

/** Parse "HH:mm" → { hours, minutes } */
function parseTime(t: string): { hours: number; minutes: number } {
  const [h, m] = t.split(':').map(Number)
  return { hours: h || 0, minutes: m || 0 }
}

/** Check if a Date is within the active daily window */
export function isWithinWindow(
  date: Date,
  activeStart: string,
  activeEnd: string,
  activeDays: number[]
): boolean {
  const day = date.getDay()
  if (!activeDays.includes(day)) return false

  const start = parseTime(activeStart)
  const end = parseTime(activeEnd)

  const nowMinutes = date.getHours() * 60 + date.getMinutes()
  const startMinutes = start.hours * 60 + start.minutes
  const endMinutes = end.hours * 60 + end.minutes

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes
}

/**
 * Given a timestamp, return the next valid timestamp that falls within
 * the active time window. If already within the window, returns the
 * original timestamp unchanged.
 */
export function nextValidSlot(
  timestamp: number,
  activeStart: string,
  activeEnd: string,
  activeDays: number[]
): number {
  const date = new Date(timestamp)

  // Cap at 14 days to prevent infinite loops
  for (let attempts = 0; attempts < 14 * 24 * 60; attempts++) {
    if (isWithinWindow(date, activeStart, activeEnd, activeDays)) {
      return date.getTime()
    }

    const day = date.getDay()
    const start = parseTime(activeStart)
    const startMinutes = start.hours * 60 + start.minutes
    const nowMinutes = date.getHours() * 60 + date.getMinutes()

    if (activeDays.includes(day) && nowMinutes < startMinutes) {
      // Same day, but before active window — jump to start
      date.setHours(start.hours, start.minutes, 0, 0)
      return date.getTime()
    }

    // Jump to next day at activeStart
    date.setDate(date.getDate() + 1)
    date.setHours(start.hours, start.minutes, 0, 0)
  }

  // Fallback: return original timestamp if no valid slot found
  return timestamp
}

import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { normalizeTimeRanges, isWithinAnyWindow, nextValidSlot } from '../_shared/timeWindow'

/**
 * CheckInTime Node
 *
 * First child of the loop. Each iteration does TWO checks:
 *
 * 1. **Active Hours** — is NOW within any of the configured time ranges?
 *    If not → sleep until the next valid slot across any range.
 *
 * 2. **Scheduled Time** — does this video have a `scheduled_for`?
 *    If yes and it's in the future → sleep until that exact time.
 *    This replaces the old Timeout node: wait BEFORE each video.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const ranges = normalizeTimeRanges(ctx.params)

  // ── Step 1: Active Hours Check ─────────────────────
  const now = new Date()
  if (!isWithinAnyWindow(now, ranges)) {
    const nextSlotMs = nextValidSlot(now.getTime(), ranges)
    const sleepMs = Math.max(0, nextSlotMs - now.getTime())
    const sleepMins = (sleepMs / 60_000).toFixed(0)

    const wakeStr = new Date(nextSlotMs).toLocaleString('vi-VN', {
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    })

    const rangeDesc = ranges.map(r => `${r.start}–${r.end}`).join(', ')
    ctx.logger.info(`[CheckInTime] ⏰ Outside active window (${rangeDesc}). Sleeping ${sleepMins}min until ${wakeStr}`)
    ctx.onProgress(`⏰ Outside active hours. Resuming at ${wakeStr}...`)
    await new Promise(resolve => setTimeout(resolve, sleepMs))
    ctx.logger.info(`[CheckInTime] ✅ Woke up — within active window now`)
  }

  // ── Step 2: Wait for scheduled_for time ────────────
  const scheduledFor = input?.scheduled_for
  if (scheduledFor && typeof scheduledFor === 'number') {
    const waitMs = scheduledFor - Date.now()
    if (waitMs > 0) {
      const scheduledStr = new Date(scheduledFor).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      const waitMins = (waitMs / 60_000).toFixed(1)
      ctx.logger.info(`[CheckInTime] ⏳ Waiting ${waitMins}min until scheduled time ${scheduledStr}`)
      ctx.onProgress(`⏳ Next video at ${scheduledStr} (${waitMins}min)...`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      ctx.logger.info(`[CheckInTime] ✅ Scheduled time reached`)
    } else {
      ctx.logger.info(`[CheckInTime] ✅ Scheduled time already passed — proceeding immediately`)
    }
  }

  ctx.onProgress(`✅ Ready — continuing`)
  return { data: input, action: 'continue' }
}

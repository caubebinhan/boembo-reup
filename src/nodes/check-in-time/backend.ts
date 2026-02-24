import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { isWithinWindow, nextValidSlot } from '../_shared/timeWindow'

/**
 * CheckInTime Node
 *
 * First child of the loop. Each iteration it does TWO checks:
 *
 * 1. **Active Hours** — is the current time within the campaign's daily window?
 *    If not → sleep until the next valid slot.
 *
 * 2. **Scheduled Time** — does this video have a `scheduled_for` timestamp?
 *    If yes and it's in the future → sleep until that time.
 *    This replaces the old Timeout node: instead of a fixed delay AFTER each
 *    video, we wait BEFORE each video until its scheduled time.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const activeStart = ctx.params.activeHoursStart ?? ctx.params.schedule?.start_time ?? '00:00'
  const activeEnd = ctx.params.activeHoursEnd ?? ctx.params.schedule?.end_time ?? '23:59'
  const activeDays: number[] = ctx.params.activeDays ?? ctx.params.schedule?.active_days ?? [0, 1, 2, 3, 4, 5, 6]

  // ── Step 1: Active Hours Check ─────────────────────
  const now = new Date()
  if (!isWithinWindow(now, activeStart, activeEnd, activeDays)) {
    const nextSlotMs = nextValidSlot(now.getTime(), activeStart, activeEnd, activeDays)
    const sleepMs = Math.max(0, nextSlotMs - now.getTime())
    const sleepMins = Math.round(sleepMs / 60_000)

    const wakeStr = new Date(nextSlotMs).toLocaleString('vi-VN', {
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    })

    ctx.logger.info(`[CheckInTime] ⏰ Outside active window. Sleeping ${sleepMins}min until ${wakeStr}`)
    ctx.onProgress(`⏰ Outside active hours (${activeStart}–${activeEnd}). Resuming at ${wakeStr}...`)
    await new Promise(resolve => setTimeout(resolve, sleepMs))
    ctx.logger.info(`[CheckInTime] ✅ Woke up — within active window now`)
  }

  // ── Step 2: Wait for scheduled_for time ────────────
  const scheduledFor = input?.scheduled_for
  if (scheduledFor && typeof scheduledFor === 'number') {
    const waitMs = scheduledFor - Date.now()
    if (waitMs > 0) {
      const scheduledStr = new Date(scheduledFor).toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
      })
      const waitMins = (waitMs / 60_000).toFixed(1)
      ctx.logger.info(`[CheckInTime] ⏳ Waiting ${waitMins}min until scheduled time ${scheduledStr}`)
      ctx.onProgress(`⏳ Next video at ${scheduledStr} (${waitMins}min)...`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      ctx.logger.info(`[CheckInTime] ✅ Scheduled time reached — proceeding`)
    } else {
      ctx.logger.info(`[CheckInTime] ✅ Scheduled time already passed — proceeding immediately`)
    }
  }

  ctx.onProgress(`✅ Ready — continuing`)
  return { data: input, action: 'continue' }
}

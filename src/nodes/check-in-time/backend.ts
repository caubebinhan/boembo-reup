import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { normalizeTimeRanges, isWithinAnyWindow, nextValidSlot } from '../_shared/timeWindow'

/**
 * CheckInTime Node
 *
 * Performs up to three checks:
 * 0) Campaign start gate (firstRunAt)
 * 1) Active hour window
 * 2) Per-video scheduled_for time
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // Step 0: Campaign start gate
  if (ctx.params.firstRunAt) {
    const firstRunMs = new Date(ctx.params.firstRunAt).getTime()
    if (!isNaN(firstRunMs) && firstRunMs > Date.now()) {
      const waitMs = firstRunMs - Date.now()
      const waitMins = (waitMs / 60_000).toFixed(0)
      const startStr = new Date(firstRunMs).toLocaleString('vi-VN', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
      ctx.logger.info(`[CheckInTime] Campaign starts at ${startStr}. Waiting ${waitMins}min...`)
      ctx.onProgress(`Chờ giờ bắt đầu (${startStr})...`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      ctx.logger.info('[CheckInTime] Campaign start time reached')
    }
  }

  const ranges = normalizeTimeRanges(ctx.params)

  // Step 1: Active window check
  const now = new Date()
  if (!isWithinAnyWindow(now, ranges)) {
    const nextSlotMs = nextValidSlot(now.getTime(), ranges)
    const sleepMs = Math.max(0, nextSlotMs - now.getTime())
    const sleepMins = (sleepMs / 60_000).toFixed(0)

    const wakeStr = new Date(nextSlotMs).toLocaleString('vi-VN', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

    const rangeDesc = ranges.map((r) => `${r.start}-${r.end}`).join(', ')
    ctx.logger.info(`[CheckInTime] Outside active window (${rangeDesc}). Waiting ${sleepMins}min until ${wakeStr}`)
    ctx.onProgress(`Ngoài giờ hoạt động. Tiếp tục lúc ${wakeStr}.`)
    await new Promise((resolve) => setTimeout(resolve, sleepMs))
    ctx.logger.info('[CheckInTime] Back in active window, resuming')
  }

  // Step 2: Wait for scheduled_for
  const scheduledFor = input?.scheduled_for
  if (scheduledFor && typeof scheduledFor === 'number') {
    const waitMs = scheduledFor - Date.now()
    if (waitMs > 0) {
      const scheduledStr = new Date(scheduledFor).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
      const waitMins = (waitMs / 60_000).toFixed(1)
      ctx.logger.info(`[CheckInTime] Waiting ${waitMins}min until scheduled time ${scheduledStr}`)
      ctx.onProgress(`Video kế tiếp lúc ${scheduledStr} (${waitMins} phút).`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      ctx.logger.info('[CheckInTime] Scheduled time reached')
    } else {
      ctx.logger.info('[CheckInTime] Scheduled time already passed, continue immediately')
    }
  }

  ctx.onProgress('Sẵn sàng ✓')
  return { data: input, action: 'continue' }
}

import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'

export class ScheduleSlotAllocator implements INode {
  id = ''
  type = 'ScheduleSlotAllocator'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const gapMinutes = this.params.gap_minutes || 60
    const maxPerDay = this.params.max_per_day || 5

    // Current state from ForEachRunner persistence
    let lastSlot = ctx.variables._last_slot || Date.now()
    let postsToday = ctx.variables._posts_today || 0

    // Basic allocation logic
    if (postsToday >= maxPerDay) {
      // Move to next day
      const nextDay = new Date(lastSlot)
      nextDay.setDate(nextDay.getDate() + 1)
      nextDay.setHours(9, 0, 0, 0) // Start at 9 AM next day
      lastSlot = nextDay.getTime()
      postsToday = 0
    } else {
      lastSlot += gapMinutes * 60 * 1000
    }

    postsToday++

    // Save state back to variables for next iteration
    ctx.variables._last_slot = lastSlot
    ctx.variables._posts_today = postsToday

    return {
      status: 'scheduled',
      data: {
        scheduled_at: lastSlot
      }
    }
  }
}

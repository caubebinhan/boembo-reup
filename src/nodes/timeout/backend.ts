import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { CodedError, isCodedError } from '@core/errors/CodedError'

// Default matches wizard default (WizardDetails / WizardSchedule both default to 60)
const DEFAULT_GAP_MINUTES = 60

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  try {
    // Read gap from wizard params - WizardSchedule / WizardDetails saves as "publishIntervalMinutes"
    const rawGap = ctx.params.publishIntervalMinutes

    // Full params dump for debugging - helps confirm whether params arrived correctly
    ctx.logger.info(`[Timeout] ctx.params = ${JSON.stringify(ctx.params)}`)
    ctx.logger.info(`[Timeout] publishIntervalMinutes=${ctx.params.publishIntervalMinutes}, publishJitterEnabled=${ctx.params.publishJitterEnabled}`)

    const gapMinutes = rawGap != null && Number(rawGap) > 0
      ? Number(rawGap)
      : DEFAULT_GAP_MINUTES

    if (rawGap == null || rawGap === '') {
      ctx.logger.info(`[Timeout] No publishIntervalMinutes in params - using default ${DEFAULT_GAP_MINUTES}min. ` +
        `Did the wizard steps initialize their defaults? Keys: ${Object.keys(ctx.params).join(', ')}`)
    }

    const gapMs = gapMinutes * 60 * 1000

    // Respect the publishJitterEnabled setting from wizard (WizardDetails)
    const publishJitterEnabled = ctx.params.publishJitterEnabled === true
    const jitter = publishJitterEnabled
      ? gapMs * 0.5 * (Math.random() * 2 - 1)   // wizard says ±50%
      : 0

    const waitMs = Math.max(5000, gapMs + jitter)
    const waitMins = (waitMs / 60000).toFixed(1)

    ctx.logger.info(`Waiting ${waitMins}min (gap=${gapMinutes}min, jitter=${publishJitterEnabled ? '±50%' : 'off'})`)
    ctx.onProgress(`Chờ ${waitMins} phút trước video kế...`)

    await new Promise(resolve => setTimeout(resolve, waitMs))

    ctx.logger.info('Timeout done, continuing to next video')
    ctx.onProgress('Hết thời gian chờ ✓')
    return { data: input, action: 'continue' }
  } catch (err: any) {
    ctx.logger.error(`[Timeout] Unexpected error: ${err?.message || err}`)
    throw isCodedError(err) ? err : new CodedError('DG-000', err?.message || String(err), err)
  }
}

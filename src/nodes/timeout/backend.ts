import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

// Default matches wizard default (Step1_Details / Step4_Schedule both default to 60)
const DEFAULT_GAP_MINUTES = 60

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // Read gap from wizard params - Step4_Schedule / Step1_Details saves as "intervalMinutes"
  const rawGap = ctx.params.intervalMinutes

  // Full params dump for debugging - helps confirm whether params arrived correctly
  ctx.logger.info(`[Timeout] ctx.params = ${JSON.stringify(ctx.params)}`)
  ctx.logger.info(`[Timeout] intervalMinutes=${ctx.params.intervalMinutes}, enableJitter=${ctx.params.enableJitter}`)

  const gapMinutes = rawGap != null && Number(rawGap) > 0
    ? Number(rawGap)
    : DEFAULT_GAP_MINUTES

  if (rawGap == null || rawGap === '') {
    ctx.logger.info(`[Timeout] No intervalMinutes in params - using default ${DEFAULT_GAP_MINUTES}min. ` +
      `Did the wizard steps initialize their defaults? Keys: ${Object.keys(ctx.params).join(', ')}`)
  }

  const gapMs = gapMinutes * 60 * 1000

  // Respect the enableJitter setting from wizard (Step1_Details)
  const enableJitter = ctx.params.enableJitter === true
  const jitter = enableJitter
    ? gapMs * 0.5 * (Math.random() * 2 - 1)   // wizard says }50%
    : 0

  const waitMs = Math.max(5000, gapMs + jitter)
  const waitMins = (waitMs / 60000).toFixed(1)

  ctx.logger.info(`? Waiting ${waitMins}min (gap=${gapMinutes}min, jitter=${enableJitter ? '}50%' : 'off'})`)
  ctx.onProgress(`? Waiting ${waitMins} min before next video...`)

  await new Promise(resolve => setTimeout(resolve, waitMs))

  ctx.logger.info('Timeout done, continuing to next video')
  ctx.onProgress('? Timeout done')
  return { data: input, action: 'continue' }
}

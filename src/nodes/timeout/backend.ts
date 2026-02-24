import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // Read gap from wizard params — wizard Step4_Schedule saves as "intervalMinutes"
  const rawGap = ctx.params.intervalMinutes
    ?? ctx.params.schedule?.interval_minutes
    ?? ctx.params.gap_minutes

  // Debug: log what params we received so we can diagnose missing gap values
  ctx.logger.info(`[Timeout] params keys: ${Object.keys(ctx.params).join(', ')}`)
  ctx.logger.info(`[Timeout] intervalMinutes=${ctx.params.intervalMinutes}, gap_minutes=${ctx.params.gap_minutes}, schedule=${JSON.stringify(ctx.params.schedule)}`)

  if (rawGap === undefined || rawGap === null) {
    ctx.logger.info('[Timeout] No gap configured — skipping wait (using 0s)')
    ctx.onProgress('⏳ No gap configured — continuing immediately')
    return { data: input, action: 'continue' }
  }

  const gapMinutes = Number(rawGap)
  if (gapMinutes <= 0) {
    ctx.logger.info('[Timeout] Gap is 0 — skipping wait')
    return { data: input, action: 'continue' }
  }

  const gapMs = gapMinutes * 60 * 1000
  const jitter = gapMs * 0.2 * (Math.random() * 2 - 1)  // ±20% jitter
  const waitMs = Math.max(1000, gapMs + jitter)
  const waitMins = (waitMs / 60000).toFixed(1)

  ctx.logger.info(`⏳ Wait ${gapMinutes}min (configured) → actual ${waitMins}min (with jitter)`)
  ctx.onProgress(`⏳ Waiting ${waitMins} minutes before next video...`)

  await new Promise(resolve => setTimeout(resolve, waitMs))

  ctx.logger.info('Timeout complete, continuing to next video')
  ctx.onProgress('Timeout done — continuing')
  return { data: input, action: 'continue' }
}

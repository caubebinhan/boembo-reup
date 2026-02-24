import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

const DEFAULT_GAP_MINUTES = 5  // fallback if campaign has no gap configured

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // Read gap from wizard params — Step4_Schedule saves as "intervalMinutes"
  const rawGap = ctx.params.intervalMinutes
    ?? ctx.params.schedule?.interval_minutes
    ?? ctx.params.gap_minutes

  // Log received params (helpful for debugging missing gap values)
  ctx.logger.info(`[Timeout] params keys: ${Object.keys(ctx.params).join(', ')}`)
  ctx.logger.info(`[Timeout] intervalMinutes=${ctx.params.intervalMinutes}`)

  const gapMinutes = rawGap != null && Number(rawGap) > 0
    ? Number(rawGap)
    : DEFAULT_GAP_MINUTES   // always wait — never skip

  if (rawGap == null || rawGap === '') {
    ctx.logger.info(`[Timeout] No gap configured — using default ${DEFAULT_GAP_MINUTES}min`)
  }

  const gapMs = gapMinutes * 60 * 1000
  const jitter = gapMs * 0.15 * (Math.random() * 2 - 1)  // ±15% jitter
  const waitMs = Math.max(5000, gapMs + jitter)
  const waitMins = (waitMs / 60000).toFixed(1)

  ctx.logger.info(`⏳ Waiting ${waitMins}min (gap=${gapMinutes}min + jitter)`)
  ctx.onProgress(`⏳ Waiting ${waitMins} min before next video...`)

  await new Promise(resolve => setTimeout(resolve, waitMs))

  ctx.logger.info('Timeout done, continuing to next video')
  ctx.onProgress('✓ Timeout done')
  return { data: input, action: 'continue' }
}

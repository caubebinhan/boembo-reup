import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // Read gap from wizard params — wizard saves as "intervalMinutes"
  const gapMinutes = ctx.params.intervalMinutes
    || ctx.params.schedule?.interval_minutes
    || ctx.params.gap_minutes
    || 1

  const gapMs = gapMinutes * 60 * 1000
  const jitter = gapMs * 0.2 * (Math.random() * 2 - 1)
  const waitMs = Math.max(1000, gapMs + jitter)
  const waitMins = Math.round(waitMs / 60000)

  ctx.logger.info(`⏳ Wait ${gapMinutes}min (configured) → actual ${waitMins}min (with jitter)`)
  ctx.onProgress(`⏳ Waiting ${waitMins} minutes...`)

  await new Promise(resolve => setTimeout(resolve, waitMs))

  ctx.logger.info('Timeout complete, continuing')
  return { data: input, action: 'continue' }
}

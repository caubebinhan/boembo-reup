import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'

export const TimeoutNode: NodeDefinition = {
  id: 'core.timeout',
  name: 'Timeout',
  category: 'control',
  icon: '⏳',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const gapMinutes = ctx.params.schedule?.interval_minutes
      || ctx.params.gap_minutes
      || 1

    const gapMs = gapMinutes * 60 * 1000
    const jitter = gapMs * 0.2 * (Math.random() * 2 - 1)
    const waitMs = Math.max(1000, gapMs + jitter)

    ctx.logger.info(`Waiting ${Math.round(waitMs / 1000)}s before next item`)
    ctx.onProgress(`⏳ Waiting ${Math.round(waitMs / 60000)}m...`)

    await new Promise(resolve => setTimeout(resolve, waitMs))

    ctx.logger.info('Timeout complete, continuing')
    return { data: input, action: 'continue' }
  }
}

nodeRegistry.register(TimeoutNode)

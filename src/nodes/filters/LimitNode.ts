import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'

export const LimitNode: NodeDefinition = {
  id: 'core.limit',
  name: 'Limit',
  category: 'filter',
  icon: '🔢',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const videos = Array.isArray(input) ? input : (input.videos || [])
    const max = ctx.params.limit?.max || ctx.params.max_videos || 100
    const result = videos.slice(0, max)
    ctx.logger.info(`Limit: ${videos.length} → ${result.length}`)
    return { data: result }
  }
}

nodeRegistry.register(LimitNode)

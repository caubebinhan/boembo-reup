import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export const LimitNode: NodeDefinition = {
  id: 'core.limit',
  name: 'Limit',
  category: 'filter',
  
  default_execution: { strategy: 'inline' },

  config_schema: {
    fields: [
      {
        key: 'max',
        label: 'Maximum Videos',
        type: 'number',
        default: 100
      }
    ]
  },

  input_type: 'video_list',
  output_type: 'video_list',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const videos = input.data as any[] || []
    const result = videos.slice(0, ctx.config.max)
    
    ctx.logger.info(`Limit: ${videos.length} → ${result.length}`)
    return { type: 'video_list', data: result, emit_mode: 'batch' }
  }
}

import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export const QualityFilterNode: NodeDefinition = {
  id: 'core.quality_filter',
  name: 'Quality Filter',
  category: 'filter',
  
  default_execution: { strategy: 'inline' },

  config_schema: {
    fields: [
      {
        key: 'min_views',
        label: 'Minimum Views',
        type: 'number',
        default: 0
      },
      {
        key: 'min_likes',
        label: 'Minimum Likes',
        type: 'number',
        default: 0
      },
      {
        key: 'min_duration_seconds',
        label: 'Min Duration (seconds)',
        type: 'number',
        default: 0
      },
      {
        key: 'max_duration_seconds',
        label: 'Max Duration (seconds)',
        type: 'number',
        default: 0,
        description: '0 = no limit'
      }
    ]
  },

  input_type: 'video_list',
  output_type: 'video_list',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const videos = input.data as any[] || []
    const { min_views, min_likes, min_duration_seconds, max_duration_seconds } = ctx.config
    
    const result = videos.filter(v => {
      if (min_views > 0 && (v.stats?.views || 0) < min_views) return false
      if (min_likes > 0 && (v.stats?.likes || 0) < min_likes) return false
      if (min_duration_seconds > 0 && (v.duration_seconds || 0) < min_duration_seconds) return false
      if (max_duration_seconds > 0 && (v.duration_seconds || 0) > max_duration_seconds) return false
      return true
    })
    
    ctx.logger.info(`QualityFilter: ${videos.length} → ${result.length}`)
    return { type: 'video_list', data: result, emit_mode: 'batch' }
  }
}

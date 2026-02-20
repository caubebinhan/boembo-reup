import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'

export const DeduplicatorNode: NodeDefinition = {
  id: 'core.deduplicator',
  name: 'Deduplicator',
  category: 'filter',
  
  default_execution: { strategy: 'inline' },

  config_schema: {
    fields: [
      {
        key: 'check_db',
        label: 'Check against published history',
        type: 'boolean',
        default: true
      }
    ]
  },

  input_type: 'video_list',
  output_type: 'video_list',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const videos = input.data as any[] || []
    const { check_db } = ctx.config
    
    const seen = new Set()
    let result = videos.filter(v => {
      if (seen.has(v.platform_id)) return false
      seen.add(v.platform_id)
      return true
    })
    
    if (check_db && ctx.campaign_id) {
      try {
        const records = db.prepare(`
          SELECT platform_id FROM videos 
          WHERE campaign_id = ? AND status IN ('published','verified')
        `).all(ctx.campaign_id) as any[]
        
        const publishedSet = new Set(records.map(r => r.platform_id))
        result = result.filter(v => !publishedSet.has(v.platform_id))
      } catch (err) {
        ctx.logger.error('Failed to dedup against DB', err)
      }
    }
    
    ctx.logger.info(`Dedup: ${videos.length} → ${result.length}`)
    return { type: 'video_list', data: result, emit_mode: 'batch' }
  }
}

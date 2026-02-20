import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export const TikTokScannerNode: NodeDefinition = {
  id: 'tiktok.scanner',
  name: 'TikTok Scanner',
  category: 'source',
  icon: '🔍',
  version: '1.0',

  default_execution: {
    strategy: 'scheduled_recurring',
    job_type: 'FLOW_SCAN',
    initial_trigger: 'campaign_start',
    repeat_after: { source: 'campaign.schedule.interval_minutes', unit: 'minutes' },
    stop_repeat_if: "campaign.status != 'active'",
    on_resume: 'reschedule_from_now'
  },

  config_schema: {
    fields: [
      {
        key: 'sources',
        label: 'Channels / Keywords',
        type: 'multi_select',
        required: true
      },
      {
        key: 'time_range',
        label: 'Time Range',
        type: 'select',
        options: [
          { value: 'history_only', label: 'History Only' },
          { value: 'future_only', label: 'Future Only (Monitor)' },
          { value: 'history_and_future', label: 'History & Future (Both)' },
          { value: 'custom_range', label: 'Custom Range' }
        ],
        default: 'history_and_future'
      },
      {
        key: 'max_videos',
        label: 'Max Videos',
        type: 'number',
        default: 50,
        show_if: "config.time_range != 'future_only'"
      },
      {
        key: 'sort_order',
        label: 'Sort Order',
        type: 'select',
        options: [
          { value: 'newest', label: 'Newest First' },
          { value: 'oldest', label: 'Oldest First' },
          { value: 'most_likes', label: 'Most Liked' },
          { value: 'most_viewed', label: 'Most Viewed' }
        ],
        default: 'newest'
      }
    ]
  },

  input_type: null,
  output_type: 'video_list',

  async execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { sources, time_range, max_videos, sort_order } = ctx.config
    // Temporary mocked scanner since tiktok_module may not exist in context yet during testing
    const scanner = ctx.variables.tiktok_module || new TikTokScanner()
    
    const allVideos: any[] = []
    
    for (const source of sources) {
      if (!source) continue
      
      ctx.onProgress(`Scanning ${source.type}: ${source.name}`)
      let result: any = { videos: [] };
      
      try {
        if (source.type === 'channel') {
          result = await scanner.scanProfile(source.name, {
            limit: max_videos,
            timeRange: time_range === 'future_only' ? 'from_now' : 'include_history',
            sinceTimestamp: ctx.variables.last_scanned_at,
            isBackground: true
          })
        } else {
          result = await scanner.scanKeyword(source.name, {
            limit: max_videos,
            sort: 'recent'
          })
        }
      } catch (err) {
        ctx.logger.error(`Failed to scan ${source.name}`, err)
        continue
      }
      
      const mappedVideos = (result.videos || []).map((v: any) => ({
        id: v.id,
        platform_id: v.id,
        source_platform: 'tiktok',
        url: v.url || `https://www.tiktok.com/@${v.author?.uniqueId}/video/${v.id}`,
        thumbnail: v.cover || v.thumbnail,
        description: v.desc || '',
        author: source.name,
        stats: { views: v.stats?.playCount, likes: v.stats?.diggCount },
        published_at: v.createTime ? new Date(v.createTime * 1000).toISOString() : new Date().toISOString(),
        source_meta: { source_type: source.type, source_name: source.name }
      }))
      
      allVideos.push(...mappedVideos)
    }
    
    allVideos.sort((a, b) => {
      if (sort_order === 'newest') return b.platform_id.localeCompare(a.platform_id)
      if (sort_order === 'oldest') return a.platform_id.localeCompare(b.platform_id)
      if (sort_order === 'most_likes') return (b.stats?.likes || 0) - (a.stats?.likes || 0)
      if (sort_order === 'most_viewed') return (b.stats?.views || 0) - (a.stats?.views || 0)
      return 0
    })
    
    ctx.variables.last_scanned_at = new Date().toISOString()
    
    return { type: 'video_list', data: allVideos, emit_mode: 'batch' }
  }
}

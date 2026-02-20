import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export const VideoDownloaderNode: NodeDefinition = {
  id: 'core.downloader',
  name: 'Video Downloader',
  category: 'transform',
  
  default_execution: {
    strategy: 'per_item_job',
    job_type: 'FLOW_STEP',
    gap_between_items: {
      source: 'campaign.schedule.interval_minutes',
      unit: 'minutes',
      jitter: true,
      jitter_percent: 30
    },
    respect_daily_window: true,
    retry: { max: 3, backoff: 'exponential', base_delay_ms: 10000, max_delay_ms: 300000 }
  },

  config_schema: {
    fields: [
      {
        key: 'quality',
        label: 'Quality',
        type: 'select',
        options: [
          { value: 'best', label: 'best' },
          { value: '1080p', label: '1080p' },
          { value: '720p', label: '720p' },
          { value: '480p', label: '480p' }
        ],
        default: 'best'
      },
      {
        key: 'max_retries',
        label: 'Max Retries',
        type: 'number',
        default: 3
      }
    ]
  },

  input_type: 'video_single',
  output_type: 'video_single',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const video = input.data as any
    if (!video) throw new Error('Input video data is missing')
    
    ctx.onProgress(`Downloading: ${video.description?.slice(0, 40) || video.platform_id}`)
    
    let localPath: string = ''
    
    switch (video.source_platform) {
      case 'tiktok':
        const tiktok = ctx.variables.tiktok_module || new TikTokScanner()
        // Here we ideally call a download method if available. Mocking download process:
        const result = await (tiktok as any).downloadVideo?.(video.url, video.platform_id, {
          quality: ctx.config.quality,
          onProgress: (msg: string) => ctx.onProgress(msg)
        })
        localPath = result?.filePath || `/downloads/${video.platform_id}.mp4`
        break
      
      case 'local':
        localPath = video.local_path
        break
      
      default:
        throw new Error(`Unsupported platform: ${video.source_platform}`)
    }
    
    if (ctx.campaign_id) {
      try {
        db.prepare(`
          INSERT OR IGNORE INTO videos (platform_id, campaign_id, local_path, status)
          VALUES (?, ?, ?, 'downloaded')
        `).run(video.platform_id, ctx.campaign_id, localPath)
      } catch (err) {
        ctx.logger.error('Failed to log downloaded video into DB', err)
      }
    }
    
    return {
      type: 'video_single',
      data: { ...video, local_path: localPath },
      emit_mode: 'each'
    }
  }
}

import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'

export class DeduplicationFilter implements INode {
  id = ''
  type = 'DeduplicationFilter'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const videos = this.params.videos || []
    
    // In real app, query better-sqlite3: 
    // SELECT source_video_id FROM video_queue WHERE campaign_id = ? AND source_video_id IN (...)
    const existingIds = new Set(['tiktok_mock_existing123'])

    const newVideos = videos.filter((v: any) => !existingIds.has(v.source_video_id))

    ctx.emit('pipeline:info', { 
      message: `Filtered ${videos.length - newVideos.length} duplicates. ${newVideos.length} new videos found.` 
    })

    return {
      status: newVideos.length > 0 ? 'filtered' : 'empty',
      data: {
        new_videos: newVideos
      }
    }
  }
}

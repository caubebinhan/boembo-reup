import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'

export class TikTokChannelScanner implements INode {
  id = ''
  type = 'TikTokChannelScanner'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const urls = this.params.urls || []
    ctx.emit('pipeline:info', { message: `Scanning ${urls.length} channels...` })
    
    // Mock Playwright scraping for demo
    const videos: any[] = []
    for (const url of urls) {
      videos.push({
        source_video_id: `tiktok_${Math.random().toString(36).substring(7)}`,
        source_url: `${url}/video/123`,
        title: `Mock Video from ${url}`,
        author: url.replace('https://tiktok.com/', ''),
        thumbnail_url: 'https://placehold.co/150x200',
        duration_sec: 15
      })
    }

    return {
      status: 'scanned',
      data: {
        scanned_videos: videos
      }
    }
  }
}

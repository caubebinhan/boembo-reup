import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'

export class VideoDownloader implements INode {
  id = ''
  type = 'VideoDownloader'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const videoUrl = this.params.video_url
    ctx.emit('pipeline:update', { 
      videoId: ctx.variables.current_video?.id,
      status: 'downloading'
    })

    // Mock download delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    const localPath = `/tmp/download_${Date.now()}.mp4`

    ctx.emit('pipeline:info', { message: `Downloaded video to ${localPath}` })

    return {
      status: 'downloaded',
      data: {
        local_path: localPath
      }
    }
  }
}

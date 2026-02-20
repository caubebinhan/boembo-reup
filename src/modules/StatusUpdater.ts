import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'

export class StatusUpdater implements INode {
  id = ''
  type = 'StatusUpdater'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const newStatus = this.params.status
    const videoId = this.params.video_id

    ctx.emit('pipeline:update', { videoId, status: newStatus })
    
    // Fire event for DB update
    ctx.emit('db:update_status', { videoId, status: newStatus })

    return { status: 'updated' }
  }
}

import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'

// Simplified mock since Playwright shouldn't be fully implemented inline without full system
export class TikTokBrowserPublisher implements INode {
  id = ''
  type = 'TikTokBrowserPublisher'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const localPath = this.params.local_path
    const account = this.params.account
    
    ctx.emit('pipeline:update', { 
      videoId: ctx.variables.current_video?.id,
      status: 'processing' // starting publish
    })

    const maxRetries = 3;
    const retryDelay = 15 * 60 * 1000; // 15 minutes
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Mock publish delay
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Mock Captcha occasionally for demonstration
        if (Math.random() < 0.2) {
          ctx.emit('pipeline:interaction_waiting', {
            campaignId: ctx.campaignId,
            type: 'captcha',
            message: 'Please solve captcha on TikTok to continue publishing'
          })
          
          await new Promise(resolve => setTimeout(resolve, 5000)) // Fake user solving it
          ctx.emit('pipeline:interaction_resolved', { campaignId: ctx.campaignId })
        }

        ctx.emit('pipeline:info', { message: `Published ${localPath} to ${account}` })
        return { status: 'posted' }

      } catch (err: any) {
        attempt++;
        ctx.emit('pipeline:error', { error: `Publish failed on attempt ${attempt}: ${err.message}` })
        
        if (attempt >= maxRetries) {
          return { status: 'failed', error: 'Max retries reached' }
        }
        
        ctx.emit('pipeline:update', { videoId: ctx.variables.current_video?.id, status: 'retrying' })
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }

    return { status: 'failed', error: 'Unknown error' }
  }
}

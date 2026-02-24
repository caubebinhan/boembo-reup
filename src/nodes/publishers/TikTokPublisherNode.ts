import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'
import { db } from '../../main/db/Database'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export const TikTokPublisherNode: NodeDefinition = {
  id: 'tiktok.publisher',
  name: 'TikTok Publisher',
  category: 'publish',
  icon: '📤',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const video = input
    if (!video?.local_path) throw new Error('No local video file to publish')

    const selectedAccounts = ctx.params.selectedAccounts || ctx.params.accounts || []
    if (selectedAccounts.length === 0) throw new Error('No publish accounts configured')

    // Round-robin account selection
    const rrKey = `rr_${ctx.campaign_id}`
    const rrState: Map<string, number> = (globalThis as any).__rrState || new Map()
    if (!(globalThis as any).__rrState) (globalThis as any).__rrState = rrState
    const idx = (rrState.get(rrKey) || 0) % selectedAccounts.length
    rrState.set(rrKey, idx + 1)
    const accountId = selectedAccounts[idx]

    let account: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PublishAccountService } = require('../../main/services/PublishAccountService')
      account = PublishAccountService.getAccount(accountId)
      if (typeof account === 'string') account = JSON.parse(account)
    } catch {
      throw new Error('Account not found')
    }

    if (!account || account.session_status === 'expired') {
      throw new Error('SESSION_EXPIRED: Account session invalid')
    }

    const caption = video.generated_caption || video.description || ''
    ctx.onProgress(`Publishing to @${account.username}...`)

    const tiktok = new TikTokScanner()
    const result = await tiktok.publishVideo(video.local_path, caption, account.cookies, {
      privacy: ctx.params.privacy || 'public',
    })

    if (!result.success) throw new Error('Publish failed')

    try {
      db.prepare(
        `UPDATE videos SET status = 'published', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`
      ).run(result.videoUrl, video.platform_id, ctx.campaign_id)
    } catch (err) {
      ctx.logger.error('Failed to update publish status', err)
    }

    ctx.logger.info(`Published: ${result.videoUrl}`)
    return { data: { ...video, published_url: result.videoUrl, published: true } }
  }
}

nodeRegistry.register(TikTokPublisherNode)

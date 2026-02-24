import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
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

  // Query account directly from DB (no dynamic require)
  const account = db.prepare(
    'SELECT * FROM publish_accounts WHERE id = ?'
  ).get(accountId) as any

  if (!account) {
    throw new Error(`Account not found: ${accountId}`)
  }
  if (account.session_status === 'expired') {
    throw new Error('SESSION_EXPIRED: Account session invalid')
  }

  // Parse cookies from JSON string
  const cookies = account.cookies_json ? JSON.parse(account.cookies_json) : null
  if (!cookies) {
    throw new Error(`Account ${account.username} has no cookies`)
  }

  const caption = video.generated_caption || video.description || ''
  ctx.onProgress(`Publishing to @${account.username}...`)

  const tiktok = new TikTokScanner()
  const result = await tiktok.publishVideo(video.local_path, caption, cookies, {
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

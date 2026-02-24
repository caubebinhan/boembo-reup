import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { ExecutionLogger } from '../../core/engine/ExecutionLogger'
import { VideoPublisher } from '../../main/tiktok/publisher/VideoPublisher'

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

  const account = db.prepare('SELECT * FROM publish_accounts WHERE id = ?').get(accountId) as any
  if (!account) throw new Error(`Account not found: ${accountId}`)
  if (account.session_status === 'expired') throw new Error('SESSION_EXPIRED: Account session invalid')

  const cookies = account.cookies_json ? JSON.parse(account.cookies_json) : null
  if (!cookies) throw new Error(`Account ${account.username} has no cookies`)

  const caption = video.generated_caption || video.description || ''
  ctx.onProgress(`Publishing to @${account.username}...`)

  // ── Emit active-item event for timeline highlighting ──
  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:active', {
    videoId: video.platform_id,
    title: video.description?.substring(0, 50) || video.platform_id,
  })

  const publisher = new VideoPublisher()
  const result = await publisher.publish(video.local_path, caption, cookies, (msg) => {
    ctx.onProgress(`[Playwright] ${msg}`)
  }, {
    privacy: ctx.params.privacy || 'public',
    username: account.username
  })

  if (!result.success) {
    // ── CAPTCHA: skip video, don't crash campaign ─────
    if (result.errorType === 'captcha') {
      ctx.logger.info(`CAPTCHA detected for video ${video.platform_id} — skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'captcha:detected', {
        videoId: video.platform_id,
        debugArtifacts: result.debugArtifacts,
      })

      try {
        db.prepare(`UPDATE videos SET status = 'captcha' WHERE platform_id = ? AND campaign_id = ?`)
          .run(video.platform_id, ctx.campaign_id)
      } catch {}

      // Return null data → FlowEngine loop skips to next item
      return { action: 'continue', data: null }
    }

    // ── Violation: skip video, continue loop ──────────
    if (result.errorType === 'violation') {
      ctx.logger.info(`Content violation for video ${video.platform_id} — skipping`)
      ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'violation:detected', {
        videoId: video.platform_id,
        error: result.error,
      })

      try {
        db.prepare(`UPDATE videos SET status = 'violation' WHERE platform_id = ? AND campaign_id = ?`)
          .run(video.platform_id, ctx.campaign_id)
      } catch {}

      return { action: 'continue', data: null }
    }

    // ── Other errors: throw to respect on_error config ──
    throw new Error(`Publish failed: ${result.error}`)
  }

  // ── Success ─────────────────────────────────────────
  try {
    db.prepare(`UPDATE videos SET status = 'published', publish_url = ? WHERE platform_id = ? AND campaign_id = ?`)
      .run(result.videoUrl, video.platform_id, ctx.campaign_id)
  } catch (err) {
    ctx.logger.error('Failed to update publish status', err)
  }

  ExecutionLogger.emitNodeEvent(ctx.campaign_id, 'publisher_1', 'video:published', {
    videoId: video.platform_id,
    videoUrl: result.videoUrl,
  })

  ctx.logger.info(`Published: ${result.videoUrl}`)
  return { data: { ...video, published_url: result.videoUrl, published: true } }
}

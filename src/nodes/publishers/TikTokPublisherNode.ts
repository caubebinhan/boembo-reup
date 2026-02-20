import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { db } from '../../main/db/Database'
import { PublishAccountService } from '../../main/services/PublishAccountService'
import { TikTokScanner } from '../../main/tiktok/TikTokScanner'

export const TikTokPublisherNode: NodeDefinition = {
  id: 'tiktok.publisher',
  name: 'TikTok Publisher',
  category: 'publish',
  
  default_execution: {
    strategy: 'per_item_job',
    job_type: 'FLOW_STEP',
    gap_between_items: { source: 'fixed', fixed_value: 0, unit: 'seconds' },
    respect_daily_window: true,
    retry: { max: 3, backoff: 'linear', base_delay_ms: 30000, max_delay_ms: 300000 },
    depends_on: 'downloader_1'
  },

  config_schema: {
    fields: [
      {
        key: 'accounts',
        label: 'Target Accounts',
        type: 'account_picker',
        required: true
      },
      {
        key: 'privacy',
        label: 'Privacy',
        type: 'select',
        options: [
          { value: 'public', label: 'public' },
          { value: 'friends', label: 'friends' },
          { value: 'private', label: 'private' }
        ],
        default: 'public'
      },
      {
        key: 'account_rotation',
        label: 'Account Rotation',
        type: 'select',
        options: [
          { value: 'round_robin', label: 'Round Robin' },
          { value: 'all', label: 'Publish to All Accounts' },
          { value: 'random', label: 'Random' }
        ],
        default: 'round_robin'
      }
    ]
  },

  input_type: 'video_single',
  output_type: 'publish_result',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const video = input.data as any
    const { accounts, privacy, account_rotation } = ctx.config
    
    // Choose account according to rotation logic
    const accountId = this.selectAccount(accounts, ctx.campaign_id, account_rotation)
    const accountStr = PublishAccountService.getAccount(accountId)
    const account = typeof accountStr === 'string' ? JSON.parse(accountStr) : accountStr
    
    if (!account || account.session_status === 'expired') {
      throw new Error('SESSION_EXPIRED: Account session invalid')
    }
    
    const caption = video.generated_caption || video.description || ''
    const filePath = video.processed_path || video.local_path
    
    if (!filePath) {
      throw new Error('No video file available to publish')
    }
    
    ctx.onProgress(`Publishing to @${account.username}...`)
    
    const tiktok = ctx.variables.tiktok_module || new TikTokScanner() // fallback if tiktok_module is missing
    const result = await (tiktok as any).publishVideo?.(filePath, caption, account.cookies, {
      privacy,
      onProgress: (msg: string) => ctx.onProgress(msg)
    })
    
    if (result?.requiresCaptcha) {
      throw new Error('CAPTCHA: Manual intervention required')
    }
    
    if (!result?.success) {
      throw new Error(result?.error || 'Publish failed')
    }
    
    try {
      db.prepare(`
        UPDATE videos SET status = 'published', publish_url = ? WHERE platform_id = ?
      `).run(result.videoUrl, video.platform_id)
    } catch (err) {
      ctx.logger.error('Failed to update DB publish status', err)
    }
    
    ctx.onProgress(`✅ Published: ${result.videoUrl}`)
    
    return {
      type: 'publish_result',
      data: {
        success: true,
        platform: 'tiktok',
        account_id: accountId,
        published_url: result.videoUrl,
        platform_video_id: result.videoId
      },
      emit_mode: 'each'
    }
  },

  selectAccount(accounts: any[], campaignId: string, strategy: string = 'round_robin'): any {
    if (!accounts || accounts.length === 0) throw new Error('No accounts configured')

    if (strategy === 'random') {
      return accounts[Math.floor(Math.random() * accounts.length)]
    }
    
    if (strategy === 'all') {
      // Stub: in real fanout case FlowEngine duplicates the job logic for all accounts.
      return accounts[0]
    }
    
    // Default: Round_robin
    const rrState = (globalThis as any).rrState || new Map()
    if (!(globalThis as any).rrState) {
      ;(globalThis as any).rrState = rrState
    }

    const key = `rr_${campaignId}`
    const idx = (rrState.get(key) || 0) % accounts.length
    rrState.set(key, idx + 1)
    return accounts[idx]
  }
} as NodeDefinition & { selectAccount: (a: any[], c: string, s: string) => any }

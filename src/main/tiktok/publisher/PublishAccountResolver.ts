import { NodeExecutionContext } from '../../../core/nodes/NodeDefinition'
import { db } from '../../db/Database'

export type PublishAccountSelection = {
  account: any
  accountId: string
  selectedIndex: number
  source: 'preset' | 'round_robin'
}

function readSelectedAccounts(ctx: NodeExecutionContext): string[] {
  const raw = Array.isArray(ctx.params.selectedAccounts) ? ctx.params.selectedAccounts : []
  return raw.map((v: any) => String(v || '').trim()).filter(Boolean)
}

function resolveAccountById(accountId: string) {
  const account = db.prepare('SELECT * FROM publish_accounts WHERE id = ?').get(accountId) as any
  if (!account) throw new Error(`Account not found: ${accountId}`)
  if (account.session_status === 'expired') throw new Error('SESSION_EXPIRED: Account session invalid')
  return account
}

export function selectPublishAccount(video: any, ctx: NodeExecutionContext): PublishAccountSelection {
  const selectedAccounts = readSelectedAccounts(ctx)
  if (selectedAccounts.length === 0) throw new Error('No publish accounts configured')

  const presetId = String(video?.publish_target_account_id || '').trim()
  if (presetId) {
    const account = resolveAccountById(presetId)
    const selectedIndex = Math.max(0, selectedAccounts.indexOf(presetId))
    return { account, accountId: presetId, selectedIndex, source: 'preset' }
  }

  const rrKey = `rr_${ctx.campaign_id}`
  const rrState: Map<string, number> = (globalThis as any).__rrState || new Map()
  if (!(globalThis as any).__rrState) (globalThis as any).__rrState = rrState
  const idx = (rrState.get(rrKey) || 0) % selectedAccounts.length
  rrState.set(rrKey, idx + 1)

  const accountId = selectedAccounts[idx]
  const account = resolveAccountById(accountId)
  return { account, accountId, selectedIndex: idx, source: 'round_robin' }
}

export function attachPublishAccountTarget(video: any, selection: PublishAccountSelection): any {
  return {
    ...video,
    publish_target_account_id: selection.accountId,
    publish_target_account_username: selection.account?.username || video?.publish_target_account_username,
    publish_target_account_source: selection.source,
    publish_target_account_index: selection.selectedIndex,
  }
}


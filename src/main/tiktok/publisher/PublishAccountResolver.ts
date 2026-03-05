import { NodeExecutionContext } from '@core/nodes/NodeDefinition'
import { accountRepo } from '../../db/repositories/AccountRepo'
import { CodedError } from '@core/errors/CodedError'

export type PublishAccountSelection = {
  account: any
  accountId: string
  selectedIndex: number
  source: 'preset' | 'round_robin'
}

function readSelectedAccounts(ctx: NodeExecutionContext): string[] {
  const raw = Array.isArray(ctx.params.publishAccountIds) ? ctx.params.publishAccountIds : []
  return raw.map((v: any) => String(v || '').trim()).filter(Boolean)
}

function resolveAccountById(accountId: string) {
  const account = accountRepo.findById(accountId)
  /** @throws DG-130 — Account ID not found in database */
  if (!account) throw new CodedError('DG-130', `Account not found: ${accountId}`)
  /** @throws DG-131 — Account session cookies are expired or invalid */
  if (account.session_status === 'expired') throw new CodedError('DG-131', 'SESSION_EXPIRED: Account session invalid')
  return account
}

export function selectPublishAccount(video: any, ctx: NodeExecutionContext): PublishAccountSelection {
  const publishAccountIds = readSelectedAccounts(ctx)
  /** @throws DG-132 — No publish accounts configured for campaign */
  if (publishAccountIds.length === 0) throw new CodedError('DG-132', 'No publish accounts configured')

  const presetId = String(video?.publish_target_account_id || '').trim()
  if (presetId) {
    const account = resolveAccountById(presetId)
    const selectedIndex = Math.max(0, publishAccountIds.indexOf(presetId))
    return { account, accountId: presetId, selectedIndex, source: 'preset' }
  }

  const rrKey = `rr_${ctx.campaign_id}`
  const rrState: Map<string, number> = (globalThis as any).__rrState || new Map()
  if (!(globalThis as any).__rrState) (globalThis as any).__rrState = rrState
  const idx = (rrState.get(rrKey) || 0) % publishAccountIds.length
  rrState.set(rrKey, idx + 1)

  const accountId = publishAccountIds[idx]
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

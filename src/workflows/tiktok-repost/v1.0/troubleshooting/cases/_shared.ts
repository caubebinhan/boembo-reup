import type { TroubleshootingCaseDefinition, TroubleshootingCaseMeta } from '@main/services/troubleshooting/types'

const TIKTOK_REPOST_V1 = { workflowId: 'tiktok-repost', workflowVersion: '1.0' as const }

type TiktokRepostCaseInput = Omit<TroubleshootingCaseDefinition, 'workflowId' | 'workflowVersion'>

export function ttCase(def: TiktokRepostCaseInput): TroubleshootingCaseDefinition {
  return {
    ...TIKTOK_REPOST_V1,
    ...def,
  }
}

export function meta(def: TroubleshootingCaseMeta): TroubleshootingCaseMeta {
  return def
}

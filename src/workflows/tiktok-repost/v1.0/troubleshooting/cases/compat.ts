import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

export const compatCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    id: 'tiktok-repost-v1.compat.flow-snapshot-version-lock',
    title: 'Compat: Flow Snapshot Version Lock',
    description: 'Old campaign with frozen flow_snapshot continues to run after code changes without version drift.',
    risk: 'safe',
    category: 'compat',
    group: 'compat',
    tags: ['compat', 'flow_snapshot', 'versioning', 'db'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'fixtureCampaignVersion', value: '1.0 (frozen snapshot)' }],
      checks: {
        db: ['campaign.flow_snapshot remains unchanged during execution', 'Campaign.workflow_version preserved'],
        logs: ['Flow resolution path logs whether snapshot vs loader flow used'],
      },
      passMessages: ['Existing campaigns remain executable after workflow code changes'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.compat.params-defaults-upgrade',
    title: 'Compat: Params Defaults on Upgrade',
    description: 'Missing params in older campaign docs get safe defaults and do not break v1 runtime.',
    risk: 'safe',
    category: 'compat',
    group: 'compat',
    tags: ['compat', 'params', 'defaults', 'edge'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'fixtureMissingParams', value: 'interval/privacy/publishVerifyMaxRetries variants' }],
      checks: {
        db: ['Older campaign docs load without data corruption', 'Defaulted params are applied safely at runtime'],
        logs: ['Fallback/default branches are observable in troubleshooting output'],
      },
      errorMessages: ['Missing param should never crash node execution with undefined access'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.compat.workflow-catalog-dynamic-discovery',
    title: 'Compat: Dynamic Workflow/Version Discovery in Debug Tab',
    description: 'Troubleshooting registry/UI lists workflow versions dynamically from providers and keeps tiktok-repost@1.0 filter stable.',
    risk: 'safe',
    category: 'compat',
    group: 'compat',
    tags: ['compat', 'ui', 'versioning', 'dynamic-discovery'],
    level: 'intermediate',
    implemented: false,
    meta: meta({
      parameters: [{ key: 'fixtureProviders', value: 'tiktok-repost@1.0 + upload-local@1.0 (+ future versions)' }],
      checks: {
        db: ['No DB assertions (UI/catalog runtime check)'],
        ui: ['Workflow dropdown lists discovered providers only', 'Version dropdown updates by workflow selection'],
        logs: ['Provider auto-discovery count and duplicate-case warnings (if any) logged'],
      },
      passMessages: ['Debug tab remains version-aware without hardcoded workflow/version lists'],
    }),
  }),
]

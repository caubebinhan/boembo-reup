import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'tiktok.account_dedup',
  name: 'TikTok Account Dedup',
  label: 'Acc Dedup',
  color: '#6366f1',
  category: 'filter',
  icon: '🔍',
  description: 'Per-account duplicate detection before publish (exact + AV similarity)',
  errorPrefix: 'ADD',
  behavior: {
    sideEffects: ['reads_db', 'network_call'],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

export default manifest

import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'tiktok.account_dedup',
  name: 'TikTok Account Dedup',
  category: 'filter',
  icon: '磁',
  description: 'Per-account duplicate detection before publish (exact + AV similarity)',
}

export default manifest


import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'tiktok.account_dedup',
  name: 'TikTok Account Dedup',
  label: 'Acc Dedup',
  color: '#6366f1',
  category: 'filter',
  icon: '🔍',
  description: 'Per-account duplicate detection before publish (exact + AV similarity)',
}

const node: NodeDefinition = { manifest, execute }
export default node

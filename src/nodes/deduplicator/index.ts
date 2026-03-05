import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.skip_processed',
  name: 'Deduplicator',
  label: 'Dedup',
  color: '#6366f1',
  category: 'filter',
  icon: '🔄',
  description: 'Skip videos that have already been processed',
}

const node: NodeDefinition = { manifest, execute }
export default node

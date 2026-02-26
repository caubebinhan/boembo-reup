import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.deduplicator',
  name: 'Deduplicator',
  label: 'Dedup',
  color: '#6366f1',
  category: 'filter',
  icon: '🔄',
  description: 'Skip videos that have already been processed',
}

export default manifest

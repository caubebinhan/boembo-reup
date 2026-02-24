import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.deduplicator',
  name: 'Deduplicator',
  category: 'filter',
  icon: '🔄',
  description: 'Skip videos that have already been processed',
}

export default manifest

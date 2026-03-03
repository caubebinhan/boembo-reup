import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.deduplicator',
  name: 'Deduplicator',
  label: 'Dedup',
  color: '#6366f1',
  category: 'filter',
  icon: '🔄',
  description: 'Skip videos that have already been processed',
  errorPrefix: 'DDP',
  behavior: {
    sideEffects: ['reads_db'],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

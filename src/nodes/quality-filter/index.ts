import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.quality_filter',
  name: 'Quality Filter',
  category: 'filter',
  icon: '🎯',
  description: 'Filter videos by views, likes, and duration',
  errorPrefix: 'QFL',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

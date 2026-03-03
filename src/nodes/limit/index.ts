import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.limit',
  name: 'Limit',
  category: 'filter',
  icon: '🔢',
  description: 'Limit the number of videos processed',
  errorPrefix: 'LMT',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

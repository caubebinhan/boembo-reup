import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.timeout',
  name: 'Timeout',
  label: 'Wait',
  color: '#6b7280',
  category: 'control',
  icon: '⏳',
  description: 'Wait between items with configurable delay and jitter',
}

const node: NodeDefinition = { manifest, execute }
export default node

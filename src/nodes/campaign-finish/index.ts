import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.campaign_finish',
  name: 'Campaign Finish',
  label: 'Finish',
  color: '#10b981',
  category: 'control',
  icon: '🏁',
  description: 'Mark campaign as finished and update final stats',
}

const node: NodeDefinition = { manifest, execute }
export default node

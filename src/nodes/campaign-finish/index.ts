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
  errorPrefix: 'FIN',
  behavior: {
    sideEffects: ['writes_to_db'],
    idempotent: true,
    crashBehavior: 'fail_job',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

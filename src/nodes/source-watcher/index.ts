import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.source_watcher',
  name: 'Monitoring',
  label: 'Monitor',
  color: '#14b8a6',
  category: 'control',
  icon: '📊',
  description: 'Health check and monitoring node',
  retryPolicy: {
    maxRetries: 1,
    backoff: 'fixed',
    initialDelayMs: 5000,
    maxDelayMs: 5000,
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.monitoring',
  name: 'Monitoring',
  label: 'Monitor',
  color: '#14b8a6',
  category: 'control',
  icon: '📊',
  description: 'Health check and monitoring node',
  errorPrefix: 'MON',
  retryPolicy: {
    maxRetries: 1,
    backoff: 'fixed',
    initialDelayMs: 5000,
    maxDelayMs: 5000,
  },
  behavior: {
    sideEffects: ['network_call'],
    idempotent: true,
    crashBehavior: 'retry',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

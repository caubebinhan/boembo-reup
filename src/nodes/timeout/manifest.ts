import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.timeout',
  name: 'Timeout',
  label: 'Wait',
  color: '#6b7280',
  category: 'control',
  icon: '⏳',
  description: 'Wait between items with configurable delay and jitter',
  errorPrefix: 'TMO',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'retry',
  },
}

export default manifest

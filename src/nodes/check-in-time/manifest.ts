import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.check_in_time',
  name: 'Check In Time',
  label: 'Time Check',
  color: '#f59e0b',
  category: 'control',
  icon: '⏰',
  description: 'Gate loop execution: sleep until within active daily time window',
  errorPrefix: 'TIM',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'retry',
  },
}

export default manifest

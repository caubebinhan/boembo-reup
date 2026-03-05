import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.time_gate',
  name: 'Check In Time',
  label: 'Time Check',
  color: '#f59e0b',
  category: 'control',
  icon: '⏰',
  description: 'Gate loop execution: sleep until within active daily time window',
}

const node: NodeDefinition = { manifest, execute }
export default node

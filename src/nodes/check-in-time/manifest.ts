import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.check_in_time',
  name: 'Check In Time',
  category: 'control',
  icon: '⏰',
  description: 'Gate loop execution: sleep until within active daily time window',
}

export default manifest

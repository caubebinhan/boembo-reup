import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.monitoring',
  name: 'Monitor',
  category: 'control',
  icon: '👁',
  description: 'Periodically re-scan sources for new videos and feed them to the scheduler',
  editable_settings: {
    fields: [
      {
        key: 'monitorIntervalMinutes',
        label: 'Tần suất quét (phút)',
        type: 'number',
        default: 5,
        description: 'Khoảng thời gian giữa các lần quét tìm video mới',
      },
    ],
  },
}

export default manifest

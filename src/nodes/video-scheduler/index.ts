import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.video_scheduler',
  name: 'Video Scheduler',
  label: 'Scheduler',
  color: '#eab308',
  category: 'control',
  icon: '📋',
  description: 'Calculate scheduled times for scanned videos and save to DB',
  editable_settings: {
    fields: [
      {
        key: 'intervalMinutes',
        label: 'Khoảng cách giữa các video (phút)',
        type: 'number',
        default: 60,
        description: 'Thời gian giãn cách giữa mỗi video publish',
      },
    ],
  },
  on_save_event: 'reschedule',
  errorPrefix: 'SCH',
  behavior: {
    sideEffects: ['writes_to_db'],
    idempotent: true,
    crashBehavior: 'fail_job',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

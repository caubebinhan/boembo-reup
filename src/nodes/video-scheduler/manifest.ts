import { NodeManifest } from '@core/nodes/NodeDefinition'

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
}

export default manifest

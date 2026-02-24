import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.notify',
  name: 'Notify',
  category: 'control',
  icon: '🔔',
  description: 'Send a desktop notification via the OS notification system',
  config_schema: {
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'string',
        required: true,
        default: 'Boembo Alert',
        description: 'Notification title. Supports {{variable}} templates from input data.',
      },
      {
        key: 'body',
        label: 'Body',
        type: 'string',
        required: false,
        default: '{{description}}',
        description: 'Notification body. Supports {{variable}} templates.',
      },
      {
        key: 'sound',
        label: 'Play sound',
        type: 'boolean',
        default: true,
      },
    ],
  },
}

export default manifest

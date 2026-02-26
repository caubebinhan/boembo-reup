import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'tiktok.publisher',
  name: 'TikTok Publisher',
  label: 'Publish',
  color: '#ec4899',
  category: 'publish',
  icon: '📤',
  description: 'Publish videos to TikTok accounts',
  editable_settings: {
    fields: [
      {
        key: 'privacy',
        label: 'Privacy',
        type: 'select',
        default: 'public',
        options: [
          { value: 'public', label: 'Public' },
          { value: 'friends', label: 'Friends' },
          { value: 'private', label: 'Private' },
        ],
        description: 'Chế độ bảo mật khi publish video',
      },
    ],
  },
}

export default manifest

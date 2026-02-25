import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'tiktok.scanner',
  name: 'TikTok Scanner',
  category: 'source',
  icon: '🔍',
  description: 'Scan TikTok channels and keywords for videos',
  editable_settings: {
    fields: [
      {
        key: 'max_videos',
        label: 'Số video tối đa',
        type: 'number',
        default: 50,
        description: 'Giới hạn số video scan được từ mỗi source',
      },
    ],
  },
}

export default manifest

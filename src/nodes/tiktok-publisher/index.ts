import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

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
  errorPrefix: 'PUB',
  retryPolicy: {
    maxRetries: 0,
    backoff: 'none',
    initialDelayMs: 0,
    maxDelayMs: 0,
  },
  behavior: {
    sideEffects: ['browser_session', 'network_call', 'publishes_content'],
    idempotent: false,
    crashBehavior: 'skip_video',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.limit',
  name: 'Limit',
  category: 'filter',
  icon: '🔢',
  description: 'Limit the number of videos processed',
  errorPrefix: 'LMT',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

export default manifest

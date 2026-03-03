import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.caption_gen',
  name: 'Caption Generator',
  label: 'Caption',
  color: '#0ea5e9',
  category: 'transform',
  icon: '✏️',
  description: 'Generate captions from template with variable substitution',
  errorPrefix: 'CAP',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

export default manifest

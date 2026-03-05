import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.caption_gen',
  name: 'Caption Generator',
  label: 'Caption',
  color: '#0ea5e9',
  category: 'transform',
  icon: '✏️',
  description: 'Generate captions from template with variable substitution',
}

const node: NodeDefinition = { manifest, execute }
export default node

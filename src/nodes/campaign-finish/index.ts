import { NodeDefinition } from '@core/nodes/NodeDefinition'
import manifest from './manifest'
import { execute } from './backend'

const node: NodeDefinition = { manifest, execute }
export default node

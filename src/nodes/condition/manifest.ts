import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.condition',
  name: 'Condition',
  category: 'control',
  icon: '🔀',
  description: 'Evaluate a JS expression and branch flow via conditional edges',
  config_schema: {
    fields: [
      {
        key: 'expression',
        label: 'Expression',
        type: 'string',
        required: true,
        description: 'JS expression on `data`. E.g. "data.status === \'violation\'"',
        default: 'data.status === "published"',
      },
    ],
  },
}

export default manifest

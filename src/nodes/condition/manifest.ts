import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.condition',
  name: 'Condition',
  label: 'Condition',
  color: '#f97316',
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
        description: 'JS expression on `data`. E.g. "data.status === \'publish_failed\'"',
        default: 'data.status === "published"',
      },
    ],
  },
  errorPrefix: 'CND',
  behavior: {
    sideEffects: [],
    idempotent: true,
    crashBehavior: 'fail_job',
  },
}

export default manifest

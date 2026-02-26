import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.js_runner',
  name: 'JS Runner',
  category: 'transform',
  icon: '⚡',
  description: 'Execute custom JavaScript code. Access incoming data via `data` and campaign params via `params`.',
  config_schema: {
    fields: [
      {
        key: 'code',
        label: 'JavaScript Code',
        type: 'string',
        required: true,
        description: 'JS code to execute. Use `data` for input, `params` for campaign params. Return modified data or a new object.',
        default: '// Transform data\nreturn data',
      },
    ],
  },
  editable_settings: {
    fields: [
      {
        key: 'code',
        label: 'JavaScript Code',
        type: 'string',
        required: true,
        description: 'JS code to execute. Use `data` for input, `params` for campaign params. Return modified data or a new object.',
        default: '// Transform data\nreturn data',
      },
    ],
  },
}

export default manifest

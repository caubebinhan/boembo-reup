import type { NodeDefinition } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

export default {
  manifest: {
    id: 'core.item_limit',
    name: 'Item Limit',
    label: 'Limit',
    color: '#6366f1',
    category: 'filter',
    icon: '🔢',
    description: 'Cap the maximum number of items to process',
    retryPolicy: {
      maxRetries: 0,
      backoff: 'none',
      initialDelayMs: 0,
      maxDelayMs: 0,
    },
  },
  execute,
} satisfies NodeDefinition

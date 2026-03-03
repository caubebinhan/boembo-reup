import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.file_source',
  name: 'Local File Source',
  label: 'Files',
  color: '#8b5cf6',
  category: 'source',
  icon: '📁',
  description: 'Load local video files for publishing',
  errorPrefix: 'FSR',
  retryPolicy: {
    maxRetries: 2,
    backoff: 'fixed',
    initialDelayMs: 1000,
    maxDelayMs: 5000,
  },
  behavior: {
    sideEffects: ['reads_disk'],
    idempotent: true,
    crashBehavior: 'retry',
  },
}

export default manifest

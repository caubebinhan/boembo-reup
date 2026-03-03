import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.video_edit',
  name: 'Video Editor',
  label: 'Edit',
  color: '#f59e0b',
  category: 'transform',
  icon: '🎬',
  description: 'Apply video editing operations (crop, resize, watermark, etc.)',
  errorPrefix: 'VED',
  retryPolicy: {
    maxRetries: 1,
    backoff: 'fixed',
    initialDelayMs: 2000,
    maxDelayMs: 2000,
  },
  behavior: {
    sideEffects: ['writes_to_disk', 'cpu_intensive'],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

export default manifest

/**
 * VideoEdit Node — Entry Point
 * ────────────────────────────
 * Auto-discovered by the NodeRegistry.
 * Plugins now live in @core/video-edit/plugins (clean architecture).
 */
import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'

// Import the plugins barrel — this registers all builtin plugins
import '@core/video-edit/plugins'

import execute from './backend'

const manifest: NodeManifest = {
  id: 'core.video_edit',
  name: 'Video Editor',
  label: 'Edit',
  color: '#f59e0b',
  category: 'transform',
  icon: '🎬',
  description: 'Apply video editing operations (crop, resize, watermark, etc.)',
  retryPolicy: {
    maxRetries: 1,
    backoff: 'fixed',
    initialDelayMs: 2000,
    maxDelayMs: 2000,
  },
}

const videoEditNode: NodeDefinition = { manifest, execute }
export default videoEditNode

/**
 * VideoEdit Node — Entry Point
 * ────────────────────────────
 * Auto-discovered by the NodeRegistry.
 * Plugins now live in @core/video-edit/plugins (clean architecture).
 */
import { NodeDefinition } from '@core/nodes/NodeDefinition'

// Import the plugins barrel — this registers all builtin plugins
import '@core/video-edit/plugins'

import manifest from './manifest'
import execute from './backend'

// ── Node Definition ─────────────────────────────────
const videoEditNode: NodeDefinition = {
  manifest,
  execute,
}

export default videoEditNode

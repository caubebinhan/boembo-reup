/**
 * VideoEdit Node — Entry Point
 * ────────────────────────────
 * Auto-discovered by the NodeRegistry. Registers all builtin plugins.
 */
import { NodeDefinition } from '@core/nodes/NodeDefinition'
import { videoEditPluginRegistry } from '@core/video-edit'
import manifest from './manifest'
import execute from './backend'

// ── Auto-discover & register builtin plugins ────────
const builtinPlugins = import.meta.glob('./plugins/builtin/**/*.ts', { eager: true })

for (const [path, mod] of Object.entries(builtinPlugins)) {
  const plugin = (mod as any).default
  if (plugin?.id && plugin?.buildFilters) {
    videoEditPluginRegistry.register(plugin)
  } else {
    console.warn(`[VideoEdit] Skipping invalid plugin at ${path}`)
  }
}

console.log(
  `[VideoEdit] Registered ${videoEditPluginRegistry.size} builtin plugin(s):`,
  videoEditPluginRegistry.listAll().map((p) => p.id).join(', '),
)

// ── Node Definition ─────────────────────────────────
const videoEditNode: NodeDefinition = {
  manifest,
  execute,
}

export default videoEditNode

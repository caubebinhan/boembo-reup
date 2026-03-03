/**
 * Video Edit Plugins — Barrel Export
 * ──────────────────────────────────
 * Auto-registers all builtin plugins with the registry.
 * Import this module to ensure all plugins are available.
 */
import { videoEditPluginRegistry } from '../VideoEditPluginRegistry'

// Auto-discover all plugin files in subdirectories
const pluginModules = import.meta.glob('./**/*.ts', { eager: true })

for (const [path, mod] of Object.entries(pluginModules)) {
  // Skip this barrel file
  if (path === './index.ts') continue

  const plugin = (mod as any).default
  if (plugin?.id && plugin?.buildFilters) {
    // Set source to 'builtin' if not already set
    if (!plugin.source) plugin.source = 'builtin'
    if (!plugin.version) plugin.version = '1.0.0'
    videoEditPluginRegistry.register(plugin)
  } else {
    console.warn(`[VideoEditPlugins] Skipping invalid plugin at ${path}`)
  }
}

console.log(
  `[VideoEditPlugins] Registered ${videoEditPluginRegistry.size} builtin plugin(s):`,
  videoEditPluginRegistry.listAll().map(p => p.id).join(', '),
)

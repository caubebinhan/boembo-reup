/**
 * Video Edit Plugin Registry
 * ──────────────────────────
 * Singleton registry for video-edit plugins.
 * Supports builtin, marketplace, and local plugin sources.
 */
import type { VideoEditPlugin, VideoEditOperation, PluginGroup, PluginSource, PluginManifest } from './types'
import { generateOperationId, toPluginManifest } from './types'

class VideoEditPluginRegistryImpl {
  private readonly plugins = new Map<string, VideoEditPlugin>()

  /** Register a plugin */
  register(plugin: VideoEditPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[VideoEditPluginRegistry] Overwriting plugin: ${plugin.id}`)
    }
    this.plugins.set(plugin.id, plugin)
  }

  /** Unregister a plugin by ID */
  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId)
  }

  /** Get a plugin by ID */
  get(pluginId: string): VideoEditPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  /** Get all plugins in a specific group */
  getByGroup(group: PluginGroup): VideoEditPlugin[] {
    return [...this.plugins.values()].filter((p) => p.group === group)
  }

  /** Get all plugins from a specific source */
  getBySource(source: PluginSource): VideoEditPlugin[] {
    return [...this.plugins.values()].filter((p) => (p.source || 'builtin') === source)
  }

  /** List all registered plugins */
  listAll(): VideoEditPlugin[] {
    return [...this.plugins.values()]
  }

  /**
   * Get serializable plugin manifests for the renderer.
   * Strips runtime functions — only UI-safe metadata.
   */
  getPluginMetas(): PluginManifest[] {
    return [...this.plugins.values()].map(toPluginManifest)
  }

  /**
   * Get default VideoEditOperation[] for new campaigns.
   * Returns operations for all plugins with `defaultEnabled: true`.
   */
  getDefaults(): VideoEditOperation[] {
    return [...this.plugins.values()].map((p, i) => ({
      id: generateOperationId(),
      pluginId: p.id,
      enabled: p.defaultEnabled ?? false,
      params: this.getDefaultParams(p),
      order: i,
    }))
  }

  /** Extract default param values from a plugin's configSchema */
  private getDefaultParams(plugin: VideoEditPlugin): Record<string, any> {
    const params: Record<string, any> = {}
    for (const field of plugin.configSchema) {
      if (field.default !== undefined) {
        params[field.key] = field.default
      }
    }
    return params
  }

  /** Get count of registered plugins */
  get size(): number {
    return this.plugins.size
  }
}

/** Global singleton */
export const videoEditPluginRegistry = new VideoEditPluginRegistryImpl()

/**
 * Video Edit Plugin Registry
 * ──────────────────────────
 * Singleton registry for video-edit plugins.
 * Plugins self-register at import time (similar to NodeRegistry).
 */
import type { VideoEditPlugin, VideoEditConfig, PluginGroup } from './types'

class VideoEditPluginRegistryImpl {
  private plugins = new Map<string, VideoEditPlugin>()

  /** Register a plugin. Throws if a plugin with the same ID already exists. */
  register(plugin: VideoEditPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[VideoEditPluginRegistry] Overwriting plugin: ${plugin.id}`)
    }
    this.plugins.set(plugin.id, plugin)
  }

  /** Unregister a plugin by ID. */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  /** Get a plugin by ID. */
  get(pluginId: string): VideoEditPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  /** Get all plugins in a specific group. */
  getByGroup(group: PluginGroup): VideoEditPlugin[] {
    return [...this.plugins.values()].filter((p) => p.group === group)
  }

  /** List all registered plugins. */
  listAll(): VideoEditPlugin[] {
    return [...this.plugins.values()]
  }

  /**
   * Get default VideoEditConfig[] for new campaigns.
   * Returns configs for all plugins with `defaultEnabled: true`.
   */
  getDefaults(): VideoEditConfig[] {
    return [...this.plugins.values()].map((p) => ({
      pluginId: p.id,
      enabled: p.defaultEnabled ?? false,
      params: this.getDefaultParams(p),
    }))
  }

  /** Extract default param values from a plugin's configSchema. */
  private getDefaultParams(plugin: VideoEditPlugin): Record<string, any> {
    const params: Record<string, any> = {}
    for (const field of plugin.configSchema) {
      if (field.default !== undefined) {
        params[field.key] = field.default
      }
    }
    return params
  }

  /** Get count of registered plugins. */
  get size(): number {
    return this.plugins.size
  }
}

/** Global singleton */
export const videoEditPluginRegistry = new VideoEditPluginRegistryImpl()

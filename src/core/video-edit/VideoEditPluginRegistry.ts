/**
 * Video Edit Plugin Registry
 * ──────────────────────────
 * Singleton registry for video-edit plugins.
 * Plugins self-register at import time (similar to NodeRegistry).
 */
import type { VideoEditPlugin, VideoEditOperation, PluginGroup } from './types'
import { generateOperationId } from './types'

class VideoEditPluginRegistryImpl {
  private readonly plugins = new Map<string, VideoEditPlugin>()

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
   * Get serializable plugin metadata for the renderer (wizard UI).
   * Strips runtime functions (buildFilters, validate, etc.) — only UI-safe data.
   */
  getPluginMetas() {
    return [...this.plugins.values()].map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group,
      icon: p.icon,
      description: p.description,
      defaultEnabled: p.defaultEnabled,
      allowMultipleInstances: p.allowMultipleInstances,
      addInstanceLabel: p.addInstanceLabel,
      recommended: p.recommended,
      warning: p.warning,
      previewHint: p.previewHint || 'none',
      configSchema: p.configSchema,
    }))
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

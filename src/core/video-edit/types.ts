/**
 * Video Edit Plugin — Type Definitions
 * ─────────────────────────────────────
 * PURE DOMAIN TYPES — no infrastructure imports.
 * Supports multi-instance operations (user can add N instances of same plugin).
 */

// ── Video Filter (pure domain — was FFmpegFilter) ───

export interface VideoFilter {
  /** FFmpeg filter name (e.g. 'scale', 'overlay', 'hflip') */
  filter: string
  /** Filter options (e.g. { w: 1920, h: 1080 }) */
  options: Record<string, any>
  /** Named input pads (e.g. ['0:v'], ['scaled', '1:v']) */
  inputs?: string[]
  /** Named output pads (e.g. ['scaled'], ['out']) */
  outputs?: string[]
}

// ── Plugin Config Schema ────────────────────────────

export type FieldType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'select'
  | 'slider'
  | 'time'           // seconds input (with mm:ss formatting)
  | 'timeRange'      // start + end time range picker
  | 'position'       // 9-point grid + custom x/y drag picker
  | 'region'         // rectangle region selector on video canvas
  | 'asset'          // file picker (image/audio)
  | 'color'          // color picker
  | 'aspectRatio'    // aspect ratio selector with visual presets

export interface PluginConfigField {
  key: string
  type: FieldType
  label: string
  default?: any
  min?: number
  max?: number
  step?: number
  /** For 'slider' type: unit label (e.g. '%', 'px', 'ms') */
  unit?: string
  options?: Array<{ value: string; label: string; icon?: string }>
  description?: string
  /** Conditional visibility: show only when another field has a specific value */
  condition?: { field: string; value: any }
  /** Whether this field accepts array values (e.g. segments, regions) */
  isArray?: boolean
  /** Sub-fields for array items */
  arrayFields?: PluginConfigField[]
  /** Placeholder text */
  placeholder?: string
  /** Whether this is a required field (default: true for most) */
  required?: boolean
}

// ── Plugin Context (passed to buildFilters) ─────────

export interface PluginContext {
  /** Input video dimensions */
  inputWidth: number
  inputHeight: number
  /** Input video duration in seconds */
  inputDurationSec: number
  /** Input video frame rate */
  inputFps: number
  /** Temp directory for intermediate files */
  tempDir: string
  /** Resolve an asset ID to its filesystem path */
  assetResolver: (assetId: string) => string
  /** Get the next available input index for multi-input plugins */
  nextInputIndex: () => number
  /** Unique instance key (for multi-instance filter naming) */
  instanceKey: string
}

// ── Multi-pass command ──────────────────────────────

export interface VideoEditCommand {
  inputs: Array<{ path: string; options?: string[] }>
  filters: VideoFilter[]
  outputOptions: Record<string, any>
  /** If set, the output replaces the main video for subsequent commands */
  outputIsMainVideo?: boolean
}

// ── Plugin Definition ───────────────────────────────

export type PluginGroup = 'transform' | 'overlay' | 'filter' | 'audio' | 'anti-detect'

export type PreviewHintType =
  | 'overlay-image'
  | 'overlay-text'
  | 'crop-guide'
  | 'blur-region'
  | 'transform'
  | 'none'

/** Where the plugin came from */
export type PluginSource = 'builtin' | 'marketplace' | 'local'

export interface VideoEditPlugin {
  /** Unique plugin ID (e.g. 'builtin.rotate') */
  id: string
  /** Display name */
  name: string
  /** Plugin group */
  group: PluginGroup
  /** Icon (emoji or path) */
  icon: string
  /** Short description */
  description: string
  /** Plugin version (semver) */
  version?: string
  /** Plugin source */
  source?: PluginSource
  /** If true, this plugin is enabled by default for new campaigns */
  defaultEnabled?: boolean
  /** If true, user can add multiple instances of this plugin */
  allowMultipleInstances?: boolean
  /** Label for the "add" button when allowMultipleInstances is true */
  addInstanceLabel?: string
  /** If true, show "Recommended" badge — safe, invisible anti-detect plugins */
  recommended?: boolean
  /** Warning text shown when user enables this plugin */
  warning?: string
  /** How this plugin renders on the editor canvas */
  previewHint?: PreviewHintType

  /** Config schema — used to auto-render UI form */
  configSchema: PluginConfigField[]

  /** Build filter(s) from user params */
  buildFilters(params: Record<string, any>, ctx: PluginContext): VideoFilter[]

  /** Validate params before execution */
  validate?(params: Record<string, any>): string | null

  /** If true, requires multi-pass processing */
  requiresMultiPass?: boolean

  /** Build separate commands for multi-pass */
  buildMultiPassCommands?(params: Record<string, any>, ctx: PluginContext): VideoEditCommand[]

  /** Additional input files (e.g. watermark, audio) */
  getAdditionalInputs?(params: Record<string, any>, ctx: PluginContext): string[]

  /** Extra output options (e.g. -map_metadata -1) */
  getOutputOptions?(params: Record<string, any>): string[]
}

// ── Serializable Plugin Metadata (for IPC / marketplace) ──

export interface PluginManifest {
  id: string
  name: string
  group: PluginGroup
  icon: string
  description: string
  version: string
  source: PluginSource
  previewHint: PreviewHintType
  configSchema: PluginConfigField[]
  defaultEnabled?: boolean
  allowMultipleInstances?: boolean
  addInstanceLabel?: string
  recommended?: boolean
  warning?: string
}

// ── User-facing Operation (saved in campaign params) ──

export interface VideoEditOperation {
  /** Unique ID for this operation instance */
  id: string
  /** Plugin ID */
  pluginId: string
  /** Whether this operation is enabled */
  enabled: boolean
  /** Plugin-specific params (matching configSchema keys) */
  params: Record<string, any>
  /** Sort order (lower = executed first) */
  order: number
}

/**
 * @deprecated Use VideoEditOperation[] instead
 */
export interface VideoEditConfig {
  pluginId: string
  enabled: boolean
  params: Record<string, any>
}

/** Convert legacy VideoEditConfig[] to VideoEditOperation[] */
export function migrateToOperations(configs: VideoEditConfig[]): VideoEditOperation[] {
  return configs.map((c, i) => ({
    id: `${c.pluginId}_${i}`,
    pluginId: c.pluginId,
    enabled: c.enabled,
    params: c.params,
    order: i,
  }))
}

/** Generate a unique operation ID */
export function generateOperationId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Extract a PluginManifest from a VideoEditPlugin (strips runtime functions) */
export function toPluginManifest(plugin: VideoEditPlugin): PluginManifest {
  return {
    id: plugin.id,
    name: plugin.name,
    group: plugin.group,
    icon: plugin.icon,
    description: plugin.description,
    version: plugin.version || '1.0.0',
    source: plugin.source || 'builtin',
    previewHint: plugin.previewHint || 'none',
    configSchema: plugin.configSchema,
    defaultEnabled: plugin.defaultEnabled,
    allowMultipleInstances: plugin.allowMultipleInstances,
    addInstanceLabel: plugin.addInstanceLabel,
    recommended: plugin.recommended,
    warning: plugin.warning,
  }
}

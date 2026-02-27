/**
 * Video Edit Plugin — Type Definitions
 * ─────────────────────────────────────
 * Core interfaces for the plugin-based video editing system.
 * Supports multi-instance operations (user can add N instances of same plugin).
 */
import type { FFmpegFilter } from '@main/ffmpeg/FFmpegCommandBuilder'

// Re-export for convenience
export type { FFmpegFilter }

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

// ── FFmpeg Command (for multi-pass plugins) ─────────

export interface FFmpegCommand {
  inputs: Array<{ path: string; options?: string[] }>
  filters: FFmpegFilter[]
  outputOptions: Record<string, any>
  /** If set, the output replaces the main video for subsequent commands */
  outputIsMainVideo?: boolean
}

// ── Plugin Definition ───────────────────────────────

export type PluginGroup = 'transform' | 'overlay' | 'filter' | 'audio' | 'anti-detect'

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
  /** If true, this plugin is enabled by default for new campaigns */
  defaultEnabled?: boolean
  /** If true, user can add multiple instances of this plugin (e.g. watermarks) */
  allowMultipleInstances?: boolean
  /** Label for the "add" button when allowMultipleInstances is true */
  addInstanceLabel?: string

  /** Config schema — used to auto-render wizard UI form */
  configSchema: PluginConfigField[]

  /**
   * Build FFmpeg filter(s) from user params.
   * Returns filters that can be merged into a single-pass filter_complex.
   */
  buildFilters(params: Record<string, any>, ctx: PluginContext): FFmpegFilter[]

  /** Validate params before execution. Return error string or null. */
  validate?(params: Record<string, any>): string | null

  /**
   * If true, this plugin cannot be merged into a single filter_complex pass.
   * Must implement buildMultiPassCommands instead.
   */
  requiresMultiPass?: boolean

  /**
   * Build separate FFmpeg commands for multi-pass processing.
   * Each command is executed sequentially.
   */
  buildMultiPassCommands?(params: Record<string, any>, ctx: PluginContext): FFmpegCommand[]

  /**
   * Provides additional input files (e.g. watermark, audio).
   * Called before buildFilters to register inputs.
   */
  getAdditionalInputs?(params: Record<string, any>, ctx: PluginContext): string[]

  /**
   * Provides extra output options (e.g. -map_metadata -1 for metadata strip).
   * Merged into the final command's output options.
   */
  getOutputOptions?(params: Record<string, any>): string[]
}

// ── User-facing Config (saved in campaign params) ───

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
 * Kept for backward compatibility during migration
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

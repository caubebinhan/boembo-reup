/**
 * Video Edit Module — Barrel Export
 */
export type {
  VideoEditPlugin,
  VideoEditOperation,
  VideoEditConfig,
  PluginConfigField,
  PluginContext,
  PluginGroup,
  FieldType,
  VideoFilter,
  VideoEditCommand,
  PreviewHintType,
  PluginSource,
  PluginManifest,
} from './types'

export { generateOperationId, migrateToOperations, toPluginManifest } from './types'
export { videoEditPluginRegistry } from './VideoEditPluginRegistry'
export { executeVideoEditPipeline } from './VideoEditPipeline'
export type { PipelineOptions, PipelineResult } from './VideoEditPipeline'
export type { VideoProcessor, VideoMetadata, CommandResult } from './ports'

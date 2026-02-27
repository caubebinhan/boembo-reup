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
  FFmpegFilter,
  FFmpegCommand,
} from './types'

export { generateOperationId, migrateToOperations } from './types'
export { videoEditPluginRegistry } from './VideoEditPluginRegistry'
export { executeVideoEditPipeline } from './VideoEditPipeline'
export type { PipelineOptions, PipelineResult } from './VideoEditPipeline'

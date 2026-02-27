/**
 * FFmpeg Module — Barrel Export
 * ─────────────────────────────
 * Shared FFmpeg utilities for the entire application.
 */
export { resolveBinary, runBinary, ensureFfmpegAvailable, clearAvailabilityCache } from './FFmpegBinary'
export type { CommandResult } from './FFmpegBinary'

export { probeVideo } from './FFmpegProbe'
export type { VideoMetadata } from './FFmpegProbe'

export { FFmpegCommandBuilder } from './FFmpegCommandBuilder'
export type { FFmpegFilter, OutputOptions } from './FFmpegCommandBuilder'

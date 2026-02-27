/**
 * Video Edit Pipeline
 * ───────────────────
 * Orchestrates video editing by chaining enabled operations into FFmpeg commands.
 * Supports multi-instance plugins (multiple watermarks, overlays, etc.).
 *
 * Flow:
 *  1. Probe input video metadata
 *  2. Sort operations by order, filter enabled, validate params
 *  3. Separate single-pass (filter_complex) vs multi-pass operations
 *  4. Build and execute FFmpeg commands
 *  5. Return output file path
 */
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { probeVideo, type VideoMetadata } from '@main/ffmpeg/FFmpegProbe'
import { FFmpegCommandBuilder } from '@main/ffmpeg/FFmpegCommandBuilder'
import { ensureFfmpegAvailable } from '@main/ffmpeg/FFmpegBinary'
import { videoEditPluginRegistry } from './VideoEditPluginRegistry'
import type {
  VideoEditPlugin,
  VideoEditOperation,
  VideoEditConfig,
  PluginContext,
  FFmpegFilter,
} from './types'
import { migrateToOperations } from './types'

// ── Public API ──────────────────────────────────────

export interface PipelineOptions {
  /** Input video file path */
  inputPath: string
  /** Operations from campaign params (sorted by order) */
  operations?: VideoEditOperation[]
  /** @deprecated Legacy configs — auto-migrated to operations */
  configs?: VideoEditConfig[]
  /** Resolve asset ID → file path */
  assetResolver?: (assetId: string) => string
  /** Callback for progress updates */
  onProgress?: (msg: string) => void
  /** Callback per operation applied */
  onOperationApplied?: (operationId: string, pluginId: string, durationMs: number) => void
  /** Max execution timeout per FFmpeg command */
  timeoutMs?: number
}

export interface PipelineResult {
  /** Output file path (edited video) */
  outputPath: string
  /** Operations that were applied (in order) */
  appliedOperations: Array<{ id: string; pluginId: string }>
  /** Total processing time in ms */
  totalDurationMs: number
  /** Whether the video was actually modified (false = passthrough) */
  wasModified: boolean
}

interface ResolvedOperation {
  operation: VideoEditOperation
  plugin: VideoEditPlugin
}

/**
 * Execute the video edit pipeline.
 */
export async function executeVideoEditPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const startTime = Date.now()

  // 0. Check FFmpeg available
  const avail = await ensureFfmpegAvailable()
  if (!avail.ok) throw new Error(`FFmpeg not available: ${avail.reason}`)

  // 1. Normalize: support both operations[] and legacy configs[]
  const operations = opts.operations
    || (opts.configs ? migrateToOperations(opts.configs) : [])

  // 2. Sort by order, filter enabled, resolve plugins, validate
  const resolved = resolveOperations(operations, opts)

  // Nothing to do → passthrough
  if (resolved.length === 0) {
    return {
      outputPath: opts.inputPath,
      appliedOperations: [],
      totalDurationMs: Date.now() - startTime,
      wasModified: false,
    }
  }

  // 3. Probe video
  opts.onProgress?.('Analyzing video...')
  const metadata = await probeVideo(opts.inputPath)

  // 4. Create temp dir for intermediate files
  const tempDir = await mkdtemp(join(tmpdir(), 'boembo-vedit-'))
  const appliedOperations: Array<{ id: string; pluginId: string }> = []

  try {
    // 5. Separate single-pass vs multi-pass
    const singlePass = resolved.filter((r) => !r.plugin.requiresMultiPass)
    const multiPass = resolved.filter((r) => r.plugin.requiresMultiPass)

    const ext = getExtension(opts.inputPath)
    let currentInputPath = opts.inputPath

    // 6. Execute all single-pass operations together
    if (singlePass.length > 0) {
      const singlePassOutput = join(tempDir, `singlepass${ext}`)
      opts.onProgress?.(`Applying ${singlePass.length} filter(s)...`)

      await executeSinglePass(currentInputPath, singlePassOutput, singlePass, metadata, tempDir, opts)
      currentInputPath = singlePassOutput

      for (const r of singlePass) {
        appliedOperations.push({ id: r.operation.id, pluginId: r.plugin.id })
        opts.onOperationApplied?.(r.operation.id, r.plugin.id, 0)
      }
    }

    // 7. Execute multi-pass operations sequentially
    for (let i = 0; i < multiPass.length; i++) {
      const r = multiPass[i]
      const multiPassOutput = join(tempDir, `multipass_${i}${ext}`)
      const opStart = Date.now()

      opts.onProgress?.(`${r.plugin.icon} ${r.plugin.name}...`)
      await executeMultiPass(currentInputPath, multiPassOutput, r, metadata, tempDir, opts)

      currentInputPath = multiPassOutput
      appliedOperations.push({ id: r.operation.id, pluginId: r.plugin.id })
      opts.onOperationApplied?.(r.operation.id, r.plugin.id, Date.now() - opStart)
    }

    // 8. Move final output next to original file
    const outputPath = buildOutputPath(opts.inputPath)
    await rename(currentInputPath, outputPath)

    return { outputPath, appliedOperations, totalDurationMs: Date.now() - startTime, wasModified: true }
  } finally {
    rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Internal helpers ─────────────────────────────────

function resolveOperations(operations: VideoEditOperation[], opts: PipelineOptions): ResolvedOperation[] {
  const sorted = [...operations].sort((a, b) => a.order - b.order)
  const result: ResolvedOperation[] = []

  for (const op of sorted) {
    if (!op.enabled) continue
    const plugin = videoEditPluginRegistry.get(op.pluginId)
    if (!plugin) {
      opts.onProgress?.(`⚠️ Plugin not found: ${op.pluginId}, skipping`)
      continue
    }
    if (plugin.validate) {
      const err = plugin.validate(op.params)
      if (err) {
        opts.onProgress?.(`⚠️ ${plugin.name}: ${err}, skipping`)
        continue
      }
    }
    result.push({ operation: op, plugin })
  }

  return result
}

function createPluginContext(
  metadata: VideoMetadata,
  tempDir: string,
  instanceKey: string,
  opts: PipelineOptions,
  inputIndexRef: { value: number },
): PluginContext {
  return {
    inputWidth: metadata.width,
    inputHeight: metadata.height,
    inputDurationSec: metadata.durationSec,
    inputFps: metadata.fps,
    tempDir,
    assetResolver: opts.assetResolver || ((id) => id),
    nextInputIndex: () => inputIndexRef.value++,
    instanceKey,
  }
}

async function executeSinglePass(
  inputPath: string,
  outputPath: string,
  resolved: ResolvedOperation[],
  metadata: VideoMetadata,
  tempDir: string,
  opts: PipelineOptions,
): Promise<void> {
  const cmd = new FFmpegCommandBuilder()
  cmd.input(inputPath)

  const inputIndexRef = { value: 1 }
  const allFilters: FFmpegFilter[] = []
  const allOutputOptions: string[] = []

  for (const { operation, plugin } of resolved) {
    const ctx = createPluginContext(metadata, tempDir, operation.id, opts, inputIndexRef)

    // Register additional inputs
    const additionalInputs = plugin.getAdditionalInputs?.(operation.params, ctx) || []
    for (const inp of additionalInputs) cmd.input(inp)

    // Collect filters
    const filters = plugin.buildFilters(operation.params, ctx)
    allFilters.push(...filters)

    // Collect output options
    const outOpts = plugin.getOutputOptions?.(operation.params) || []
    allOutputOptions.push(...outOpts)
  }

  // Build the filter_complex chain
  if (allFilters.length > 0) {
    const wiredFilters = autoWireFilters(allFilters)
    cmd.filterComplex(wiredFilters)
    cmd.map(wiredFilters[wiredFilters.length - 1].outputs?.[0] || 'out')
    if (metadata.hasAudio) cmd.map('0:a')
  }

  cmd.output(outputPath, {
    codec: 'libx264',
    audioCodec: metadata.hasAudio ? 'aac' : undefined,
    preset: 'medium',
    movflags: '+faststart',
    extra: allOutputOptions,
  })

  const result = await cmd.execute(opts.timeoutMs || 300_000)
  if (result.code !== 0) {
    throw new Error(`FFmpeg single-pass failed (code ${result.code}): ${result.stderr.toString('utf8').slice(0, 500)}`)
  }
}

async function executeMultiPass(
  inputPath: string,
  outputPath: string,
  resolved: ResolvedOperation,
  metadata: VideoMetadata,
  tempDir: string,
  opts: PipelineOptions,
): Promise<void> {
  const { operation, plugin } = resolved
  if (!plugin.buildMultiPassCommands) {
    throw new Error(`Plugin ${plugin.id} requires multi-pass but has no buildMultiPassCommands()`)
  }

  const inputIndexRef = { value: 1 }
  const ctx = createPluginContext(metadata, tempDir, operation.id, opts, inputIndexRef)
  const commands = plugin.buildMultiPassCommands(operation.params, ctx)
  let currentInput = inputPath

  for (let i = 0; i < commands.length; i++) {
    const mpCmd = commands[i]
    const stepOutput = i < commands.length - 1
      ? join(tempDir, `mp_${randomBytes(4).toString('hex')}.mp4`)
      : outputPath

    const builder = new FFmpegCommandBuilder()
    builder.input(currentInput)
    for (const inp of mpCmd.inputs) builder.input(inp.path, inp.options)

    if (mpCmd.filters.length > 0) {
      const wired = autoWireFilters(mpCmd.filters)
      builder.filterComplex(wired)
      builder.map(wired[wired.length - 1].outputs?.[0] || 'out')
    }

    builder.output(stepOutput, { codec: 'libx264', audioCodec: 'aac', preset: 'medium', movflags: '+faststart' })

    const result = await builder.execute(opts.timeoutMs || 300_000)
    if (result.code !== 0) {
      throw new Error(`FFmpeg multi-pass step ${i} failed: ${result.stderr.toString('utf8').slice(0, 500)}`)
    }
    if (mpCmd.outputIsMainVideo !== false) currentInput = stepOutput
  }
}

/**
 * Auto-wire filters without explicit pads into a sequential chain:
 * [0:v] → filter1 → [f1] → filter2 → [f2] → ... → [out]
 */
function autoWireFilters(filters: FFmpegFilter[]): FFmpegFilter[] {
  if (filters.length === 0) return filters

  return filters.map((f, i) => {
    // If already fully wired, leave as-is
    if (f.inputs?.length && f.outputs?.length) return f

    const result = { ...f }
    if (!f.inputs?.length) result.inputs = i === 0 ? ['0:v'] : [`f${i - 1}`]
    if (!f.outputs?.length) result.outputs = i === filters.length - 1 ? ['out'] : [`f${i}`]
    return result
  })
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  return lastDot > 0 ? filePath.slice(lastDot) : '.mp4'
}

function buildOutputPath(inputPath: string): string {
  const ext = getExtension(inputPath)
  const base = inputPath.slice(0, inputPath.length - ext.length)
  return `${base}_edited${ext}`
}

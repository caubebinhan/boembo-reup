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

    // Map video: last video output (should be [out])
    cmd.map(wiredFilters[wiredFilters.length - 1].outputs?.[0] || 'out')

    // Map audio: find last audio filter output, fallback to 0:a
    if (metadata.hasAudio) {
      const lastAudioOutput = findLastAudioOutput(wiredFilters)
      cmd.map(lastAudioOutput || '0:a')
    }
  }

  cmd.output(outputPath, {
    codec: 'libx264',
    audioCodec: metadata.hasAudio ? 'aac' : undefined,
    preset: 'medium',
    movflags: '+faststart',
    extra: allOutputOptions,
  })

  // Debug: log the command for troubleshooting
  try {
    const args = cmd.build()
    console.log(`[VideoEdit] FFmpeg single-pass command:\n  ffmpeg ${args.join(' ')}`)
  } catch (e) {
    console.error('[VideoEdit] Failed to build FFmpeg args:', e)
  }

  const result = await cmd.execute(opts.timeoutMs || 300_000)
  if (result.code !== 0) {
    const stderr = result.stderr.toString('utf8')
    console.error('[VideoEdit] FFmpeg stderr:', stderr.slice(0, 2000))
    throw new Error(`FFmpeg single-pass failed (code ${result.code}): ${stderr.slice(0, 500)}`)
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
 * Find the last audio output pad in wired filters.
 * Audio filters output labels starting with 'a_' or 'noise_' or 'atempo_'.
 */
function findLastAudioOutput(filters: FFmpegFilter[]): string | null {
  let lastAudio: string | null = null
  const audioLabel = /^(a_|noise_|atempo_)/
  for (const f of filters) {
    for (const out of f.outputs || []) {
      if (audioLabel.test(out)) lastAudio = out
    }
  }
  return lastAudio
}

/**
 * Auto-wire filters into a proper filter_complex chain.
 *
 * Tracks the "current video stream" label through the chain.
 * - Filters without explicit inputs get the current stream as input.
 * - Filters without explicit outputs get an auto-generated label.
 * - Filters with explicit `[0:v]` inputs get replaced with the current stream.
 * - The last filter always outputs `[out]`.
 */
function autoWireFilters(filters: FFmpegFilter[]): FFmpegFilter[] {
  if (filters.length === 0) return filters

  let currentStream = '0:v'
  const wired: FFmpegFilter[] = []

  for (let i = 0; i < filters.length; i++) {
    const f = { ...filters[i] }
    const isLast = i === filters.length - 1

    // Determine inputs
    if (!f.inputs?.length) {
      // No explicit inputs → use current stream
      f.inputs = [currentStream]
    } else {
      // Has explicit inputs → replace any [0:v] references with current stream
      // (so blur-region's crop/overlay chains work after other plugins)
      f.inputs = f.inputs.map(inp => inp === '0:v' ? currentStream : inp)
    }

    // Determine outputs
    if (!f.outputs?.length) {
      // No explicit outputs → auto-generate
      f.outputs = isLast ? ['out'] : [`f${i}`]
      currentStream = f.outputs[0]
    } else {
      // Has explicit outputs → the last output becomes current stream for next filter
      currentStream = f.outputs[f.outputs.length - 1]
    }

    // If this is the last filter overall, ensure final output is [out]
    if (isLast && f.outputs[f.outputs.length - 1] !== 'out') {
      f.outputs = [...f.outputs.slice(0, -1), 'out']
    }

    wired.push(f)
  }

  return wired
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

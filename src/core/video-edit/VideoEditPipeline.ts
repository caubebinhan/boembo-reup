/**
 * Video Edit Pipeline
 * ───────────────────
 * Orchestrates video editing by chaining enabled operations.
 * Uses VideoProcessor port (DI) — no direct FFmpeg imports.
 *
 * Flow:
 *  1. Probe input video metadata
 *  2. Sort operations by order, filter enabled, validate params
 *  3. Separate single-pass (filter_complex) vs multi-pass operations
 *  4. Build and execute commands via VideoProcessor
 *  5. Return output file path
 */
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { videoEditPluginRegistry } from './VideoEditPluginRegistry'
import type { VideoProcessor, VideoMetadata } from './ports'
import type {
  VideoEditPlugin,
  VideoEditOperation,
  VideoEditConfig,
  PluginContext,
  VideoFilter,
} from './types'
import { migrateToOperations } from './types'
import { CodedError } from '@core/errors/CodedError'

// ── Public API ──────────────────────────────────────

export interface PipelineOptions {
  /** Input video file path */
  inputPath: string
  /** Video processor (FFmpeg adapter injected from infrastructure layer) */
  processor: VideoProcessor
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
  /** Max execution timeout per command */
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
  const { processor } = opts

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
  const metadata = await processor.probe(opts.inputPath)

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
    inputDurationSec: metadata.duration,
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
  const { processor } = opts
  const inputIndexRef = { value: 1 }
  const allFilters: VideoFilter[] = []
  const allOutputOptions: string[] = []
  const additionalInputPaths: string[] = []

  for (const { operation, plugin } of resolved) {
    const ctx = createPluginContext(metadata, tempDir, operation.id, opts, inputIndexRef)

    // Register additional inputs
    const additionalInputs = plugin.getAdditionalInputs?.(operation.params, ctx) || []
    additionalInputPaths.push(...additionalInputs)

    // Collect filters
    const filters = plugin.buildFilters(operation.params, ctx)
    allFilters.push(...filters)

    // Collect output options
    const outOpts = plugin.getOutputOptions?.(operation.params) || []
    allOutputOptions.push(...outOpts)
  }

  // Build FFmpeg args manually (no FFmpegCommandBuilder dependency)
  const args: string[] = ['-y']

  // Inputs
  args.push('-i', inputPath)
  for (const inp of additionalInputPaths) args.push('-i', inp)

  // Build the filter_complex chain
  if (allFilters.length > 0) {
    const wiredFilters = autoWireFilters(allFilters)
    const filterStr = buildFilterComplexString(wiredFilters)
    args.push('-filter_complex', filterStr)

    // Map video
    const lastVideoOut = wiredFilters[wiredFilters.length - 1].outputs?.[0] || 'out'
    args.push('-map', `[${lastVideoOut}]`)

    // Map audio
    const lastAudioOutput = findLastAudioOutput(wiredFilters)
    if (lastAudioOutput) {
      args.push('-map', `[${lastAudioOutput}]`)
    } else {
      args.push('-map', '0:a?')
    }
  }

  // Output options
  args.push('-c:v', 'libx264', '-preset', 'medium', '-movflags', '+faststart')
  if (!allFilters.length || !findLastAudioOutput(allFilters.length > 0 ? autoWireFilters(allFilters) : [])) {
    args.push('-c:a', 'aac')
  }
  args.push(...allOutputOptions, outputPath)

  // Debug
  console.log(`[VideoEdit] FFmpeg single-pass command:\n  ffmpeg ${args.join(' ')}`)

  const result = await processor.execute('ffmpeg', args, opts.timeoutMs || 300_000)
  if (result.code !== 0) {
    console.error('[VideoEdit] FFmpeg stderr:', result.stderr.slice(0, 2000))
    /** @throws DG-610 — FFmpeg single-pass encoding returned non-zero */
    throw new CodedError('DG-610', `FFmpeg single-pass failed (code ${result.code}): ${result.stderr.slice(0, 500)}`)
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
  const { processor } = opts
  const { operation, plugin } = resolved
  if (!plugin.buildMultiPassCommands) {
    /** @throws DG-611 — Plugin declared multi-pass but has no buildMultiPassCommands() */
    throw new CodedError('DG-611', `Plugin ${plugin.id} requires multi-pass but has no buildMultiPassCommands()`)
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

    const args: string[] = ['-y']
    args.push('-i', currentInput)
    for (const inp of mpCmd.inputs) {
      if (inp.options) args.push(...inp.options)
      args.push('-i', inp.path)
    }

    if (mpCmd.filters.length > 0) {
      const wired = autoWireFilters(mpCmd.filters)
      args.push('-filter_complex', buildFilterComplexString(wired))
      args.push('-map', `[${wired[wired.length - 1].outputs?.[0] || 'out'}]`)
    }

    args.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'medium', '-movflags', '+faststart', stepOutput)

    const result = await processor.execute('ffmpeg', args, opts.timeoutMs || 300_000)
    if (result.code !== 0) {
      /** @throws DG-612 — Multi-pass step N failed during pipeline execution */
      throw new CodedError('DG-612', `FFmpeg multi-pass step ${i} failed: ${result.stderr.slice(0, 500)}`)
    }
    if (mpCmd.outputIsMainVideo !== false) currentInput = stepOutput
  }
}

/**
 * Find the last audio output pad in wired filters.
 */
function findLastAudioOutput(filters: VideoFilter[]): string | null {
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
 */
function autoWireFilters(filters: VideoFilter[]): VideoFilter[] {
  if (filters.length === 0) return filters

  let currentStream = '0:v'
  const wired: VideoFilter[] = []

  for (let i = 0; i < filters.length; i++) {
    const f = { ...filters[i] }
    const isLast = i === filters.length - 1

    if (!f.inputs?.length) {
      f.inputs = [currentStream]
    } else {
      f.inputs = f.inputs.map(inp => inp === '0:v' ? currentStream : inp)
    }

    if (!f.outputs?.length) {
      f.outputs = isLast ? ['out'] : [`f${i}`]
      currentStream = f.outputs[0]
    } else {
      currentStream = f.outputs[f.outputs.length - 1]
    }

    if (isLast && f.outputs[f.outputs.length - 1] !== 'out') {
      f.outputs = [...f.outputs.slice(0, -1), 'out']
    }

    wired.push(f)
  }

  return wired
}

/**
 * Build filter_complex string from filters array.
 */
function buildFilterComplexString(filters: VideoFilter[]): string {
  return filters.map(f => {
    const inputPads = (f.inputs || []).map(i => `[${i}]`).join('')
    const outputPads = (f.outputs || []).map(o => `[${o}]`).join('')
    const entries = Object.entries(f.options).filter(([, v]) => v !== undefined && v !== null)
    let optStr = ''
    if (entries.length > 0) {
      const parts = entries.map(([k, v]) => {
        if (typeof v === 'boolean') return `${k}=${v ? '1' : '0'}`
        if (typeof v === 'string' && v.includes(':')) return `${k}='${v}'`
        return `${k}=${v}`
      })
      optStr = `=${parts.join(':')}`
    }
    return `${inputPads}${f.filter}${optStr}${outputPads}`
  }).join(';')
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

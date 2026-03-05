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

function parseFfmpegProgressLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (!trimmed.includes('time=') && !trimmed.includes('speed=')) return null

  const time = /time=([0-9:.]+)/.exec(trimmed)?.[1]
  const speed = /speed=\s*([0-9.]+x)/.exec(trimmed)?.[1]
  const fps = /fps=\s*([0-9.]+)/.exec(trimmed)?.[1]
  if (!time && !speed && !fps) return null

  const parts = ['Rendering']
  if (time) parts.push(`t=${time}`)
  if (speed) parts.push(`speed=${speed}`)
  if (fps) parts.push(`fps=${fps}`)
  return parts.join(' · ')
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

function parseAspectRatioSpec(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const [wRaw, hRaw] = value.split(':')
  const w = Number(wRaw)
  const h = Number(hRaw)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return w / h
}

function toEven(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  const rounded = Math.max(2, Math.round(value))
  const even = rounded - (rounded % 2)
  return even >= 2 ? even : 2
}

function estimateOperationMetadata(
  metadata: VideoMetadata,
  pluginId: string,
  params: Record<string, unknown>,
): VideoMetadata {
  const baseWidth = toEven(metadata.width, 2)
  const baseHeight = toEven(metadata.height, 2)
  let nextWidth = baseWidth
  let nextHeight = baseHeight

  if (pluginId === 'builtin.crop') {
    const mode = String(params.mode || 'aspect')
    if (mode === 'manual') {
      const region = params.cropRegion as { w?: number; h?: number } | undefined
      if (region && Number.isFinite(region.w) && Number.isFinite(region.h)) {
        const rw = Math.max(1, Math.min(100, Number(region.w)))
        const rh = Math.max(1, Math.min(100, Number(region.h)))
        nextWidth = toEven((baseWidth * rw) / 100, baseWidth)
        nextHeight = toEven((baseHeight * rh) / 100, baseHeight)
      } else {
        nextWidth = toEven(Number(params.w), baseWidth)
        nextHeight = toEven(Number(params.h), baseHeight)
      }
    } else {
      const targetAspect = parseAspectRatioSpec(params.aspectRatio) || (9 / 16)
      const currentAspect = baseWidth / baseHeight
      if (currentAspect > targetAspect) {
        nextWidth = toEven(baseHeight * targetAspect, baseWidth)
        nextHeight = baseHeight
      } else {
        nextWidth = baseWidth
        nextHeight = toEven(baseWidth / targetAspect, baseHeight)
      }
    }
  } else if (pluginId === 'builtin.rotate') {
    const angle = String(params.angle || '0')
    if (angle === '90' || angle === '270') {
      nextWidth = baseHeight
      nextHeight = baseWidth
    }
  } else if (pluginId === 'builtin.pad') {
    nextWidth = toEven(Number(params.targetWidth), baseWidth)
    nextHeight = toEven(Number(params.targetHeight), baseHeight)
  } else if (pluginId === 'builtin.resize') {
    const interactive = params.widthPercent != null || params.heightPercent != null || params.offsetPercent || params.canvasRect
    if (!interactive) {
      let w = Number(params.width ?? -1)
      let h = Number(params.height ?? -1)
      if (!Number.isFinite(w)) w = -1
      if (!Number.isFinite(h)) h = -1
      const mode = String(params.scaleMode || 'fit')
      const upscaleAllowed = params.upscaleAllowed ?? false
      if (!upscaleAllowed) {
        if (w > baseWidth && w !== -1) w = baseWidth
        if (h > baseHeight && h !== -1) h = baseHeight
      }

      if (w !== -1 || h !== -1) {
        if (mode === 'stretch') {
          nextWidth = w === -1 ? baseWidth : toEven(w, baseWidth)
          nextHeight = h === -1 ? baseHeight : toEven(h, baseHeight)
        } else if (w !== -1 && h !== -1) {
          nextWidth = toEven(w, baseWidth)
          nextHeight = toEven(h, baseHeight)
        } else {
          const ratio = baseWidth / Math.max(1, baseHeight)
          if (w !== -1) {
            nextWidth = toEven(w, baseWidth)
            nextHeight = toEven(nextWidth / ratio, baseHeight)
          } else {
            nextHeight = toEven(h, baseHeight)
            nextWidth = toEven(nextHeight * ratio, baseWidth)
          }
        }
      }
    }
  }

  return { ...metadata, width: nextWidth, height: nextHeight }
}

function createPluginContext(
  metadata: VideoMetadata,
  tempDir: string,
  instanceKey: string,
  opts: PipelineOptions,
  inputIndexRef: { value: number },
  additionalInputStartIndex?: number,
): PluginContext {
  return {
    inputWidth: metadata.width,
    inputHeight: metadata.height,
    inputDurationSec: metadata.duration,
    inputFps: metadata.fps,
    tempDir,
    assetResolver: opts.assetResolver || ((id) => id),
    nextInputIndex: () => inputIndexRef.value++,
    additionalInputStartIndex,
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
  let progressiveMetadata: VideoMetadata = { ...metadata }

  for (const { operation, plugin } of resolved) {
    const reservationStart = inputIndexRef.value
    const opMetadata = { ...progressiveMetadata }
    const inputCtx = createPluginContext(
      opMetadata,
      tempDir,
      operation.id,
      opts,
      inputIndexRef,
      reservationStart,
    )

    // Register additional inputs
    const additionalInputs = plugin.getAdditionalInputs?.(operation.params, inputCtx) || []
    inputIndexRef.value = reservationStart + additionalInputs.length
    additionalInputPaths.push(...additionalInputs)

    const ctx = createPluginContext(
      opMetadata,
      tempDir,
      operation.id,
      opts,
      inputIndexRef,
      reservationStart,
    )

    // Collect filters
    const filters = plugin.buildFilters(operation.params, ctx)
    allFilters.push(...filters)

    // Collect output options
    const outOpts = plugin.getOutputOptions?.(operation.params) || []
    allOutputOptions.push(...outOpts)

    progressiveMetadata = estimateOperationMetadata(opMetadata, plugin.id, operation.params)
  }

  // Build FFmpeg args manually (no FFmpegCommandBuilder dependency)
  const args: string[] = ['-y']

  // Inputs
  args.push('-i', inputPath)
  for (const inp of additionalInputPaths) args.push('-i', inp)

  // Build the filter_complex chain
  let wiredFilters: VideoFilter[] = []
  let lastAudioOutput: string | null = null
  if (allFilters.length > 0) {
    wiredFilters = autoWireFilters(allFilters)
    const filterStr = buildFilterComplexString(wiredFilters)
    args.push('-filter_complex', filterStr)

    // Map video
    const lastVideoOut = findLastVideoOutput(wiredFilters)
    args.push('-map', lastVideoOut ? `[${lastVideoOut}]` : '0:v')

    // Map audio
    lastAudioOutput = findLastAudioOutput(wiredFilters)
    if (lastAudioOutput) {
      args.push('-map', `[${lastAudioOutput}]`)
    } else {
      args.push('-map', '0:a?')
    }
  }

  // Output options
  args.push('-c:v', 'libx264', '-preset', 'medium', '-movflags', '+faststart')
  if (!allFilters.length || !lastAudioOutput) {
    args.push('-c:a', 'aac')
  }
  const normalizedOutputOptions = normalizeOutputOptions(allOutputOptions, metadata.duration)
  args.push(...normalizedOutputOptions, outputPath)

  // Debug
  console.log(`[VideoEdit] FFmpeg single-pass command:\n  ffmpeg ${args.join(' ')}`)

  let lastProgressEmitAt = 0
  let lastProgressMsg = ''
  const result = await processor.execute('ffmpeg', args, {
    timeoutMs: opts.timeoutMs || 300_000,
    onStderrLine: (line) => {
      const progress = parseFfmpegProgressLine(line)
      if (!progress) return
      const now = Date.now()
      if (progress === lastProgressMsg && now - lastProgressEmitAt < 1500) return
      if (now - lastProgressEmitAt < 800) return
      lastProgressEmitAt = now
      lastProgressMsg = progress
      opts.onProgress?.(progress)
    },
  })
  opts.onProgress?.(`Single-pass exit code: ${result.code}`)
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

    let lastProgressEmitAt = 0
    let lastProgressMsg = ''
    const result = await processor.execute('ffmpeg', args, {
      timeoutMs: opts.timeoutMs || 300_000,
      onStderrLine: (line) => {
        const progress = parseFfmpegProgressLine(line)
        if (!progress) return
        const now = Date.now()
        if (progress === lastProgressMsg && now - lastProgressEmitAt < 1500) return
        if (now - lastProgressEmitAt < 800) return
        lastProgressEmitAt = now
        lastProgressMsg = progress
        opts.onProgress?.(`[${plugin.id}] ${progress}`)
      },
    })
    opts.onProgress?.(`[${plugin.id}] exit code: ${result.code}`)
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
  for (const f of filters) {
    for (const out of f.outputs || []) {
      if (isLikelyAudioLabel(out)) lastAudio = out
    }
  }
  return lastAudio
}

/**
 * Find the last video output pad in wired filters.
 */
function findLastVideoOutput(filters: VideoFilter[]): string | null {
  let lastVideo: string | null = null
  for (const f of filters) {
    for (const out of f.outputs || []) {
      if (!isLikelyAudioLabel(out)) lastVideo = out
    }
  }
  return lastVideo
}

/**
 * Auto-wire filters into a proper filter_complex chain.
 */
function autoWireFilters(filters: VideoFilter[]): VideoFilter[] {
  if (filters.length === 0) return filters

  let currentVideoStream = '0:v'
  let currentAudioStream = '0:a'
  const wired: VideoFilter[] = []

  for (let i = 0; i < filters.length; i++) {
    const f = { ...filters[i] }
    const mediaType = inferFilterMediaType(f)
    const originalInputs = f.inputs ? [...f.inputs] : []
    const hadNoInputs = originalInputs.length === 0
    const hadMainVideoPlaceholder = originalInputs.includes('0:v')
    const hadMainAudioPlaceholder = originalInputs.includes('0:a') || originalInputs.includes('0:a?')

    if (!f.inputs?.length) {
      if (NO_INPUT_SOURCE_FILTERS.has(baseFilterName(f.filter))) {
        f.inputs = []
      } else {
        f.inputs = [mediaType === 'audio' ? currentAudioStream : currentVideoStream]
      }
    } else {
      f.inputs = f.inputs.map((inp) => {
        if (inp === '0:v') return currentVideoStream
        if (inp === '0:a' || inp === '0:a?') return currentAudioStream
        return inp
      })
    }

    if (!f.outputs?.length) {
      f.outputs = [mediaType === 'audio' ? `a_f${i}` : `f${i}`]
    } else {
      f.outputs = [...f.outputs]
    }

    const lastOut = f.outputs[f.outputs.length - 1]
    if (mediaType === 'audio') {
      const usesMainAudio = hadNoInputs || hadMainAudioPlaceholder || (f.inputs || []).includes(currentAudioStream)
      if (usesMainAudio) currentAudioStream = lastOut
    } else {
      const usesMainVideo = hadNoInputs || hadMainVideoPlaceholder || (f.inputs || []).includes(currentVideoStream)
      if (usesMainVideo) currentVideoStream = lastOut
    }

    wired.push(f)
  }

  return wired
}

const AUDIO_FILTERS = new Set([
  'asetrate',
  'aresample',
  'atempo',
  'highpass',
  'lowpass',
  'afade',
  'volume',
  'amix',
  'anoisesrc',
])

const NO_INPUT_SOURCE_FILTERS = new Set([
  'anoisesrc',
])

function baseFilterName(name: string): string {
  const base = name.split('=')[0]?.trim()
  return base || name
}

function isLikelyAudioLabel(label: string): boolean {
  if (label.includes(':a')) return true
  if (label.includes(':v')) return false
  return /^(a_|noise_|atempo_|af_|amix_)/.test(label)
}

function inferFilterMediaType(filter: VideoFilter): 'audio' | 'video' {
  const filterName = baseFilterName(filter.filter)
  if (AUDIO_FILTERS.has(filterName)) return 'audio'

  const inputs = filter.inputs || []
  if (inputs.length > 0) {
    const hasAudioInput = inputs.some(isLikelyAudioLabel)
    const hasVideoInput = inputs.some((i) => !isLikelyAudioLabel(i))
    if (hasAudioInput && !hasVideoInput) return 'audio'
    if (hasVideoInput && !hasAudioInput) return 'video'
  }

  const outputs = filter.outputs || []
  if (outputs.some(isLikelyAudioLabel)) return 'audio'
  return 'video'
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
        return `${k}=${formatFilterOptionValue(v)}`
      })
      optStr = `=${parts.join(':')}`
    }
    return `${inputPads}${f.filter}${optStr}${outputPads}`
  }).join(';')
}

function formatFilterOptionValue(value: unknown): string {
  if (typeof value === 'string') {
    const needsQuotes = /[:,]/.test(value)
    if (!needsQuotes) return value
    return `'${value.replace(/'/g, "\\'")}'`
  }
  return String(value)
}

function normalizeOutputOptions(outputOptions: string[], inputDurationSec: number): string[] {
  const normalized: string[] = []
  let trimEndSec = 0
  let trimStartSec = 0
  let hasExplicitDuration = false

  for (let i = 0; i < outputOptions.length; i++) {
    const token = outputOptions[i]
    if (token === '-t_trim_end') {
      const raw = outputOptions[i + 1]
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0) trimEndSec = Math.max(trimEndSec, parsed)
      i += 1
      continue
    }

    if (token === '-ss') {
      const raw = outputOptions[i + 1]
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0) trimStartSec = Math.max(trimStartSec, parsed)
    }

    if (token === '-t' || token === '-to') hasExplicitDuration = true

    normalized.push(token)
  }

  if (trimEndSec > 0 && !hasExplicitDuration) {
    const duration = Math.max(0.05, inputDurationSec - trimStartSec - trimEndSec)
    normalized.push('-t', duration.toFixed(3))
  }

  return normalized
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

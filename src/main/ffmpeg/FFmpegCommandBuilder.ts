/**
 * FFmpeg Command Builder
 * ──────────────────────
 * DSL for building complex FFmpeg commands with filter_complex chains.
 * Supports multi-input, named filter pads, and output codec options.
 *
 * Usage:
 *   const cmd = new FFmpegCommandBuilder()
 *     .input('/path/to/video.mp4')
 *     .input('/path/to/watermark.png')
 *     .filterComplex([
 *       { filter: 'scale', options: { w: 1920, h: 1080 }, inputs: ['0:v'], outputs: ['scaled'] },
 *       { filter: 'overlay', options: { x: 10, y: 10 }, inputs: ['scaled', '1:v'], outputs: ['out'] },
 *     ])
 *     .map('out')
 *     .output('/path/to/output.mp4', { codec: 'libx264', crf: 23 })
 *     .build()
 */
import { resolveBinary, runBinary, type CommandResult } from './FFmpegBinary'
import { CodedError } from '@core/errors/CodedError'

export interface FFmpegFilter {
  /** FFmpeg filter name (e.g. 'scale', 'overlay', 'hflip') */
  filter: string
  /** Filter options (e.g. { w: 1920, h: 1080 }) */
  options: Record<string, any>
  /** Named input pads (e.g. ['0:v'], ['scaled', '1:v']) */
  inputs?: string[]
  /** Named output pads (e.g. ['scaled'], ['out']) */
  outputs?: string[]
}

export interface OutputOptions {
  codec?: string         // -c:v (e.g. 'libx264', 'copy')
  audioCodec?: string    // -c:a (e.g. 'aac', 'copy')
  crf?: number           // -crf
  preset?: string        // -preset (e.g. 'medium', 'fast')
  format?: string        // -f (e.g. 'mp4')
  movflags?: string      // -movflags (e.g. '+faststart')
  extra?: string[]       // Extra raw args (e.g. ['-map_metadata', '-1'])
}

export class FFmpegCommandBuilder {
  private readonly inputs: Array<{ path: string; options?: string[] }> = []
  private readonly filterComplexChain: FFmpegFilter[] = []
  private readonly simpleFilters: FFmpegFilter[] = []
  private readonly mappings: string[] = []
  private outputPath = ''
  private outputOpts: OutputOptions = {}
  private readonly globalArgs: string[] = []
  private seekStart: number | null = null
  private seekEnd: number | null = null

  /**
   * Add an input file. Order matters — first input is [0], second is [1], etc.
   */
  input(path: string, options?: string[]): this {
    this.inputs.push({ path, options })
    return this
  }

  /**
   * Set seek start time (seconds). Applied as input option -ss for fast seeking.
   */
  seek(startSec: number): this {
    this.seekStart = startSec
    return this
  }

  /**
   * Set duration end time (seconds). Applied as -to.
   */
  to(endSec: number): this {
    this.seekEnd = endSec
    return this
  }

  /**
   * Add a single filter to the filter_complex chain.
   */
  filter(f: FFmpegFilter): this {
    this.filterComplexChain.push(f)
    return this
  }

  /**
   * Add multiple filters to the filter_complex chain.
   */
  filterComplex(filters: FFmpegFilter[]): this {
    this.filterComplexChain.push(...filters)
    return this
  }

  /**
   * Add a simple video filter (-vf). Use when no complex graph is needed.
   */
  videoFilter(f: FFmpegFilter): this {
    this.simpleFilters.push(f)
    return this
  }

  /**
   * Add a -map directive for stream selection.
   */
  map(label: string): this {
    this.mappings.push(label)
    return this
  }

  /**
   * Add raw global arguments (e.g. '-y' for overwrite, '-map_metadata -1').
   */
  globalArg(...args: string[]): this {
    this.globalArgs.push(...args)
    return this
  }

  /**
   * Set output file path and encoding options.
   */
  output(path: string, options?: OutputOptions): this {
    this.outputPath = path
    if (options) this.outputOpts = options
    return this
  }

  /**
   * Build the complete FFmpeg args array.
   */
  build(): string[] {
    /** @throws DG-014 — output path not set */
    if (!this.outputPath) throw new CodedError('DG-014', 'FFmpegCommandBuilder: output path is required')
    /** @throws DG-015 — no input files added */
    if (this.inputs.length === 0) throw new CodedError('DG-015', 'FFmpegCommandBuilder: at least one input is required')

    const args: string[] = ['-y', ...this.globalArgs]

    // Inputs + seek
    args.push(...this.buildInputArgs())

    // Filters
    if (this.filterComplexChain.length > 0) {
      args.push('-filter_complex', this.buildFilterComplexString())
    } else if (this.simpleFilters.length > 0) {
      args.push('-vf', this.buildSimpleFilterString())
    }

    // Mappings
    for (const m of this.mappings) {
      args.push('-map', m.startsWith('[') ? m : `[${m}]`)
    }

    // Output
    args.push(...this.buildOutputOptionArgs(), this.outputPath)
    return args
  }

  private buildInputArgs(): string[] {
    const args: string[] = []
    for (const inp of this.inputs) {
      if (inp.options) args.push(...inp.options)
      args.push('-i', inp.path)
    }
    if (this.seekStart !== null) args.push('-ss', String(this.seekStart))
    if (this.seekEnd !== null) args.push('-to', String(this.seekEnd))
    return args
  }

  private buildOutputOptionArgs(): string[] {
    const { codec, audioCodec, crf, preset, format, movflags, extra } = this.outputOpts
    const args: string[] = []
    if (codec) args.push('-c:v', codec)
    if (audioCodec) args.push('-c:a', audioCodec)
    if (crf !== undefined) args.push('-crf', String(crf))
    if (preset) args.push('-preset', preset)
    if (format) args.push('-f', format)
    if (movflags) args.push('-movflags', movflags)
    if (extra) args.push(...extra)
    return args
  }

  /**
   * Build and immediately execute the command.
   */
  async execute(timeoutMs = 300_000): Promise<CommandResult> {
    const args = this.build()
    return runBinary(resolveBinary('ffmpeg'), args, timeoutMs)
  }

  /**
   * Build the -filter_complex string from chained filters.
   *
   * Format: [in1][in2]filter=k1=v1:k2=v2[out1][out2];...
   */
  private buildFilterComplexString(): string {
    return this.filterComplexChain
      .map((f) => {
        const inputPads = (f.inputs || []).map((i) => `[${i}]`).join('')
        const outputPads = (f.outputs || []).map((o) => `[${o}]`).join('')
        const optStr = this.formatFilterOptions(f)
        return `${inputPads}${f.filter}${optStr}${outputPads}`
      })
      .join(';')
  }

  /**
   * Build simple -vf filter string (comma-separated).
   */
  private buildSimpleFilterString(): string {
    return this.simpleFilters
      .map((f) => `${f.filter}${this.formatFilterOptions(f)}`)
      .join(',')
  }

  /**
   * Format filter options as =k1=v1:k2=v2 string.
   * Handles special cases: boolean, string escaping.
   */
  private formatFilterOptions(f: FFmpegFilter): string {
    const entries = Object.entries(f.options).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length === 0) return ''
    const parts = entries.map(([k, v]) => {
      if (typeof v === 'boolean') return `${k}=${v ? '1' : '0'}`
      if (typeof v === 'string' && v.includes(':')) return `${k}='${v}'`
      return `${k}=${v}`
    })
    return `=${parts.join(':')}`
  }
}

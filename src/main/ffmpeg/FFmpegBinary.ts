/**
 * FFmpeg Binary Utilities (Shared)
 * ─────────────────────────────────
 * Shared helpers for resolving, checking, and spawning FFmpeg/FFprobe binaries.
 * Auto-configures paths from bundled @ffmpeg-installer packages on first load.
 */
import { spawn } from 'node:child_process'

// ── Auto-setup from bundled binaries ──
// Sets FFMPEG_PATH / FFPROBE_PATH if not already set by user
try {
  if (!process.env.FFMPEG_PATH) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
    process.env.FFMPEG_PATH = ffmpegInstaller.path
    console.log(`[FFmpeg] Auto-configured from bundled: ${ffmpegInstaller.path}`)
  }
} catch { /* @ffmpeg-installer not available, fall back to system ffmpeg */ }

try {
  if (!process.env.FFPROBE_PATH) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe')
    process.env.FFPROBE_PATH = ffprobeInstaller.path
    console.log(`[FFprobe] Auto-configured from bundled: ${ffprobeInstaller.path}`)
  }
} catch { /* @ffprobe-installer not available, fall back to system ffprobe */ }

export interface CommandResult {
  code: number | null
  stdout: Buffer
  stderr: Buffer
}

export interface RunBinaryOptions {
  timeoutMs?: number
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
}

let availabilityCache: { checkedAt: number; ffmpeg: boolean; ffprobe: boolean } | null = null
const AVAILABILITY_CACHE_TTL = 5 * 60_000 // 5 minutes

/**
 * Resolve absolute/system path for ffmpeg or ffprobe binary.
 * Honors FFMPEG_PATH / FFPROBE_PATH env vars (auto-set from bundled binaries above).
 */
export function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
  if (name === 'ffmpeg') return process.env.FFMPEG_PATH || 'ffmpeg'
  return process.env.FFPROBE_PATH || 'ffprobe'
}

/**
 * Spawn a binary with args and collect stdout/stderr.
 * Rejects on spawn error or timeout.
 */
export function runBinary(
  command: string,
  args: string[],
  timeoutOrOptions: number | RunBinaryOptions = 60_000,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const opts: RunBinaryOptions = typeof timeoutOrOptions === 'number'
      ? { timeoutMs: timeoutOrOptions }
      : timeoutOrOptions
    const timeoutMs = opts.timeoutMs ?? 60_000
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutPending = ''
    let stderrPending = ''
    let finished = false

    const emitLines = (input: string, pending: string, emit?: (line: string) => void): string => {
      if (!emit) return pending
      const merged = pending + input
      const parts = merged.split(/\r?\n|\r/g)
      const remainder = parts.pop() ?? ''
      for (const line of parts) {
        const trimmed = line.trim()
        if (trimmed) emit(trimmed)
      }
      return remainder
    }

    const timer = setTimeout(() => {
      if (finished) return
      finished = true
      child.kill('SIGKILL')
      reject(new Error(`Command timeout: ${command} (${timeoutMs}ms)`))
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.from(chunk)
      stdoutChunks.push(buf)
      if (opts.onStdoutLine) {
        stdoutPending = emitLines(buf.toString('utf8'), stdoutPending, opts.onStdoutLine)
      }
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.from(chunk)
      stderrChunks.push(buf)
      if (opts.onStderrLine) {
        stderrPending = emitLines(buf.toString('utf8'), stderrPending, opts.onStderrLine)
      }
    })

    child.on('error', (err) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (opts.onStdoutLine && stdoutPending.trim()) opts.onStdoutLine(stdoutPending.trim())
      if (opts.onStderrLine && stderrPending.trim()) opts.onStderrLine(stderrPending.trim())
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      })
    })
  })
}

/**
 * Check that both ffmpeg and ffprobe are available on the system.
 * Result is cached for 5 minutes.
 */
export async function ensureFfmpegAvailable(): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now()
  if (availabilityCache && now - availabilityCache.checkedAt < AVAILABILITY_CACHE_TTL) {
    const ok = availabilityCache.ffmpeg && availabilityCache.ffprobe
    return ok ? { ok } : { ok: false, reason: 'ffmpeg_or_ffprobe_not_available' }
  }

  const ffmpeg = await runBinary(resolveBinary('ffmpeg'), ['-version'], 8_000)
    .then((r) => r.code === 0)
    .catch(() => false)
  const ffprobe = await runBinary(resolveBinary('ffprobe'), ['-version'], 8_000)
    .then((r) => r.code === 0)
    .catch(() => false)

  availabilityCache = { checkedAt: now, ffmpeg, ffprobe }
  if (!ffmpeg || !ffprobe) return { ok: false, reason: 'ffmpeg_or_ffprobe_not_available' }
  return { ok: true }
}

/** Clear the availability cache (useful for tests) */
export function clearAvailabilityCache(): void {
  availabilityCache = null
}

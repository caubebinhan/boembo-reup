/**
 * FFmpeg Adapter — Implements VideoProcessor port
 * ────────────────────────────────────────────────
 * Infrastructure layer: bridges domain VideoProcessor interface
 * to actual FFmpeg/FFprobe binary calls.
 */
import { probeVideo as ffprobeVideo } from '@main/ffmpeg/FFmpegProbe'
import { resolveBinary as resolveBinaryFn, runBinary, ensureFfmpegAvailable } from '@main/ffmpeg/FFmpegBinary'
import type { VideoProcessor, VideoMetadata, CommandResult, ExecuteCommandOptions } from '@core/video-edit/ports'
import { CodedError } from '@core/errors/CodedError'

class FFmpegVideoProcessor implements VideoProcessor {
  async probe(path: string): Promise<VideoMetadata> {
    const avail = await ensureFfmpegAvailable()
    /** @throws DG-016 — FFmpeg binary not available */
    if (!avail.ok) throw new CodedError('DG-016', `FFmpeg not available: ${avail.reason}`)

    const result = await ffprobeVideo(path)
    return {
      width: result.width,
      height: result.height,
      duration: result.durationSec,
      fps: result.fps,
      codecName: result.videoCodec,
      bitrate: result.bitrate ?? undefined,
    }
  }

  async execute(
    binary: 'ffmpeg' | 'ffprobe',
    args: string[],
    timeoutOrOptions: number | ExecuteCommandOptions = 300_000,
  ): Promise<CommandResult> {
    const binPath = this.resolveBinary(binary)
    const opts: ExecuteCommandOptions = typeof timeoutOrOptions === 'number'
      ? { timeoutMs: timeoutOrOptions }
      : timeoutOrOptions
    const result = await runBinary(binPath, args, {
      timeoutMs: opts.timeoutMs ?? 300_000,
      onStdoutLine: opts.onStdoutLine,
      onStderrLine: opts.onStderrLine,
    })
    return {
      code: result.code ?? -1,
      stdout: result.stdout?.toString?.('utf8') ?? '',
      stderr: result.stderr?.toString?.('utf8') ?? '',
    }
  }

  resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
    return resolveBinaryFn(name)
  }
}

/** Singleton adapter instance */
export const ffmpegProcessor = new FFmpegVideoProcessor()

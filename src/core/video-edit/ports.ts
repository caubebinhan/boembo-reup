/**
 * Video Edit Ports — Dependency Inversion Interfaces
 * ───────────────────────────────────────────────────
 * Infrastructure adapters implement these to decouple
 * the domain layer from FFmpeg / filesystem details.
 */

export interface VideoMetadata {
  width: number
  height: number
  duration: number
  fps: number
  codecName?: string
  bitrate?: number
}

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface ExecuteCommandOptions {
  timeoutMs?: number
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
}

/**
 * Port: Video processor — abstracts FFmpeg binary interactions.
 * Implemented by FFmpegAdapter in @main/ffmpeg.
 */
export interface VideoProcessor {
  /** Probe video file for metadata */
  probe(path: string): Promise<VideoMetadata>
  /** Execute a raw command with args */
  execute(
    binary: 'ffmpeg' | 'ffprobe',
    args: string[],
    timeoutOrOptions?: number | ExecuteCommandOptions,
  ): Promise<CommandResult>
  /** Resolve binary path */
  resolveBinary(name: 'ffmpeg' | 'ffprobe'): string
}

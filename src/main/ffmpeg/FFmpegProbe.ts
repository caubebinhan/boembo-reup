/**
 * FFmpeg Probe — Video Metadata
 * ──────────────────────────────
 * Probe video files via ffprobe to extract duration, dimensions, fps, codecs, etc.
 */
import { resolveBinary, runBinary } from './FFmpegBinary'
import { CodedError } from '@core/errors/CodedError'

export interface VideoMetadata {
  durationSec: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  videoCodec: string
  audioCodec: string | null
  bitrate: number | null
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
  r_frame_rate?: string // e.g. "30/1" or "30000/1001"
  avg_frame_rate?: string
  bit_rate?: string
}

interface ProbeFormat {
  duration?: string
  bit_rate?: string
}

interface ProbeResponse {
  streams?: ProbeStream[]
  format?: ProbeFormat
}

function parseNum(v: any): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function parseFps(rateStr?: string): number {
  if (!rateStr) return 30 // fallback
  const parts = rateStr.split('/')
  if (parts.length === 2) {
    const num = Number(parts[0])
    const den = Number(parts[1])
    if (den > 0 && Number.isFinite(num)) return Math.round((num / den) * 100) / 100
  }
  const n = Number(rateStr)
  return Number.isFinite(n) && n > 0 ? n : 30
}

/**
 * Probe a video file and return structured metadata.
 * Throws on ffprobe failure.
 */
export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]

  const res = await runBinary(resolveBinary('ffprobe'), args, 20_000)
  if (res.code !== 0) {
    /** @throws DG-011 — ffprobe returned non-zero exit code */
    throw new CodedError('DG-011', `ffprobe failed (code ${res.code}): ${res.stderr.toString('utf8').slice(0, 300)}`)
  }

  let probe: ProbeResponse
  try {
    probe = JSON.parse(res.stdout.toString('utf8'))
  } catch {
    /** @throws DG-012 — ffprobe stdout is not valid JSON */
    throw new CodedError('DG-012', 'ffprobe returned invalid JSON')
  }

  const videoStream = probe.streams?.find((s) => s.codec_type === 'video')
  const audioStream = probe.streams?.find((s) => s.codec_type === 'audio')

  if (!videoStream) {
    /** @throws DG-013 — Probed file has no video stream */
    throw new CodedError('DG-013', `No video stream found in file: ${filePath}`)
  }

  const durationSec =
    parseNum(videoStream.duration) ??
    parseNum(probe.format?.duration) ??
    0

  return {
    durationSec,
    width: parseNum(videoStream.width) ?? 0,
    height: parseNum(videoStream.height) ?? 0,
    fps: parseFps(videoStream.r_frame_rate || videoStream.avg_frame_rate),
    hasAudio: !!audioStream,
    videoCodec: videoStream.codec_name || 'unknown',
    audioCodec: audioStream?.codec_name || null,
    bitrate: parseNum(probe.format?.bit_rate) ?? null,
  }
}

import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access } from 'fs/promises'

type ProbeStream = {
  codec_type?: string
  width?: number
  height?: number
  duration?: string
}

type ProbeFormat = {
  duration?: string
}

type ProbeResponse = {
  streams?: ProbeStream[]
  format?: ProbeFormat
}

export type MediaSignature = {
  version: 'avsig1'
  engine: 'ffmpeg_av'
  createdAt: number
  meta: {
    durationSec?: number
    width?: number
    height?: number
  }
  video: {
    frameSize: number
    frameStepSec: number
    hashes: string[]
  }
  audio: {
    sampleRate: number
    binMs: number
    bins: number[]
  }
}

export type MediaSignatureComputeResult = {
  signature?: MediaSignature
  skippedReason?: string
  warnings?: string[]
}

export type MediaSimilarityResult = {
  comparable: boolean
  duplicate: boolean
  score: number
  threshold: number
  videoScore?: number
  audioScore?: number
  reason: string
}

type CommandResult = {
  code: number | null
  stdout: Buffer
  stderr: Buffer
}

const HEX_BITCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
let ffmpegAvailabilityCache: { checkedAt: number; ffmpeg: boolean; ffprobe: boolean } | null = null

function parseNum(v: any): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
  if (name === 'ffmpeg') return process.env.FFMPEG_PATH || 'ffmpeg'
  return process.env.FFPROBE_PATH || 'ffprobe'
}

function runBinary(command: string, args: string[], timeoutMs = 60_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let finished = false
    const timer = setTimeout(() => {
      if (finished) return
      finished = true
      child.kill('SIGKILL')
      reject(new Error(`Command timeout: ${command}`))
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer | string) => stdoutChunks.push(Buffer.from(chunk)))
    child.stderr?.on('data', (chunk: Buffer | string) => stderrChunks.push(Buffer.from(chunk)))
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
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      })
    })
  })
}

async function ensureFfmpegAvailable(): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now()
  if (ffmpegAvailabilityCache && now - ffmpegAvailabilityCache.checkedAt < 5 * 60_000) {
    const ok = ffmpegAvailabilityCache.ffmpeg && ffmpegAvailabilityCache.ffprobe
    return ok ? { ok } : { ok: false, reason: 'ffmpeg_or_ffprobe_not_available' }
  }

  const ffmpeg = await runBinary(resolveBinary('ffmpeg'), ['-version'], 8_000).then(r => r.code === 0).catch(() => false)
  const ffprobe = await runBinary(resolveBinary('ffprobe'), ['-version'], 8_000).then(r => r.code === 0).catch(() => false)
  ffmpegAvailabilityCache = { checkedAt: now, ffmpeg, ffprobe }
  if (!ffmpeg || !ffprobe) return { ok: false, reason: 'ffmpeg_or_ffprobe_not_available' }
  return { ok: true }
}

async function probeMedia(filePath: string): Promise<ProbeResponse | null> {
  const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]
  const res = await runBinary(resolveBinary('ffprobe'), args, 20_000)
  if (res.code !== 0) return null
  try {
    return JSON.parse(res.stdout.toString('utf8')) as ProbeResponse
  } catch {
    return null
  }
}

function bytesToAverageHashHex(frameBytes: Uint8Array): string {
  if (!frameBytes.length) return ''
  let sum = 0
  for (const b of frameBytes) sum += b
  const avg = sum / frameBytes.length
  let hex = ''
  let nibble = 0
  let bitInNibble = 0
  for (let i = 0; i < frameBytes.length; i++) {
    nibble = (nibble << 1) | (frameBytes[i] >= avg ? 1 : 0)
    bitInNibble++
    if (bitInNibble === 4) {
      hex += nibble.toString(16)
      nibble = 0
      bitInNibble = 0
    }
  }
  if (bitInNibble > 0) {
    hex += (nibble << (4 - bitInNibble)).toString(16)
  }
  return hex
}

function extractVideoHashes(raw: Buffer, frameSize = 16 * 16): string[] {
  if (!raw.length || frameSize <= 0) return []
  const hashes: string[] = []
  for (let offset = 0; offset + frameSize <= raw.length; offset += frameSize) {
    hashes.push(bytesToAverageHashHex(raw.subarray(offset, offset + frameSize)))
  }
  return hashes
}

function extractAudioBins(raw: Buffer, sampleRate = 8000, binMs = 200): number[] {
  if (!raw.length) return []
  const bytesPerSample = 2
  const samplesPerBin = Math.max(1, Math.floor(sampleRate * (binMs / 1000)))
  const bytesPerBin = samplesPerBin * bytesPerSample
  const rmsValues: number[] = []

  for (let offset = 0; offset + bytesPerSample <= raw.length; offset += bytesPerBin) {
    const end = Math.min(raw.length, offset + bytesPerBin)
    let sumSq = 0
    let count = 0
    for (let p = offset; p + 1 < end; p += 2) {
      const sample = raw.readInt16LE(p)
      sumSq += sample * sample
      count++
    }
    if (count === 0) continue
    rmsValues.push(Math.sqrt(sumSq / count))
  }

  if (rmsValues.length === 0) return []
  const max = Math.max(...rmsValues) || 1
  return rmsValues.map(v => Math.max(0, Math.min(15, Math.round((v / max) * 15))))
}

async function extractVideoRawFrames(filePath: string): Promise<Buffer> {
  const args = [
    '-v', 'error',
    '-i', filePath,
    '-an',
    '-vf', 'fps=1/3,scale=16:16:flags=bilinear,format=gray',
    '-frames:v', '24',
    '-f', 'rawvideo',
    'pipe:1',
  ]
  const res = await runBinary(resolveBinary('ffmpeg'), args, 60_000)
  if (res.code !== 0) throw new Error(`ffmpeg_video_extract_failed: ${res.stderr.toString('utf8').slice(0, 300)}`)
  return res.stdout
}

async function extractAudioPcm(filePath: string): Promise<Buffer> {
  const args = [
    '-v', 'error',
    '-i', filePath,
    '-vn',
    '-ac', '1',
    '-ar', '8000',
    '-t', '90',
    '-f', 's16le',
    'pipe:1',
  ]
  const res = await runBinary(resolveBinary('ffmpeg'), args, 60_000)
  if (res.code !== 0) throw new Error(`ffmpeg_audio_extract_failed: ${res.stderr.toString('utf8').slice(0, 300)}`)
  return res.stdout
}

export async function computeMediaSignature(filePath: string): Promise<MediaSignatureComputeResult> {
  if (!filePath) return { skippedReason: 'original_file_not_found' }
  if (!(await fileExists(filePath))) return { skippedReason: 'original_file_not_found' }

  const av = await ensureFfmpegAvailable()
  if (!av.ok) return { skippedReason: av.reason || 'ffmpeg_or_ffprobe_not_available' }

  const warnings: string[] = []
  const probe = await probeMedia(filePath).catch(() => null)
  const videoStream = probe?.streams?.find(s => s.codec_type === 'video')
  const durationSec = parseNum(videoStream?.duration) ?? parseNum(probe?.format?.duration)

  let videoHashes: string[] = []
  let audioBins: number[] = []

  try {
    const rawVideo = await extractVideoRawFrames(filePath)
    videoHashes = extractVideoHashes(rawVideo)
  } catch (err: any) {
    warnings.push(String(err?.message || err))
  }

  try {
    const rawAudio = await extractAudioPcm(filePath)
    audioBins = extractAudioBins(rawAudio)
  } catch (err: any) {
    warnings.push(String(err?.message || err))
  }

  if (videoHashes.length === 0 && audioBins.length === 0) {
    return {
      skippedReason: warnings[0] || 'media_signature_extract_failed',
      warnings,
    }
  }

  return {
    signature: {
      version: 'avsig1',
      engine: 'ffmpeg_av',
      createdAt: Date.now(),
      meta: {
        durationSec,
        width: parseNum(videoStream?.width),
        height: parseNum(videoStream?.height),
      },
      video: {
        frameSize: 16,
        frameStepSec: 3,
        hashes: videoHashes,
      },
      audio: {
        sampleRate: 8000,
        binMs: 200,
        bins: audioBins,
      },
    },
    warnings: warnings.length ? warnings : undefined,
  }
}

function hexHammingSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const len = Math.min(a.length, b.length)
  if (len === 0) return 0
  let equalBits = 0
  let totalBits = 0
  for (let i = 0; i < len; i++) {
    const an = Number.parseInt(a[i], 16)
    const bn = Number.parseInt(b[i], 16)
    if (!Number.isFinite(an) || !Number.isFinite(bn)) continue
    const diff = an ^ bn
    equalBits += 4 - HEX_BITCOUNT[diff]
    totalBits += 4
  }
  return totalBits > 0 ? equalBits / totalBits : 0
}

function compareFrameHashes(a: string[], b: string[]): number | undefined {
  if (!a.length || !b.length) return undefined
  let best = 0
  for (const shift of [-1, 0, 1]) {
    let sum = 0
    let count = 0
    for (let i = 0; i < a.length; i++) {
      const j = i + shift
      if (j < 0 || j >= b.length) continue
      sum += hexHammingSimilarity(a[i], b[j])
      count++
    }
    if (count > 0) best = Math.max(best, sum / count)
  }
  return best
}

function compareAudioBins(a: number[], b: number[]): number | undefined {
  if (!a.length || !b.length) return undefined
  let best = 0
  for (let shift = -5; shift <= 5; shift++) {
    let sum = 0
    let count = 0
    for (let i = 0; i < a.length; i++) {
      const j = i + shift
      if (j < 0 || j >= b.length) continue
      const diff = Math.abs((a[i] || 0) - (b[j] || 0))
      sum += 1 - diff / 15
      count++
    }
    if (count > 0) best = Math.max(best, sum / count)
  }
  return best
}

function durationRatioOk(a?: number, b?: number): boolean {
  if (!a || !b) return true
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  if (min <= 0) return true
  return max / min <= 1.2
}

export function compareMediaSignatures(
  a: MediaSignature | null | undefined,
  b: MediaSignature | null | undefined,
  threshold = 0.92
): MediaSimilarityResult {
  if (!a || !b) {
    return { comparable: false, duplicate: false, score: 0, threshold, reason: 'missing_signature' }
  }
  if (a.version !== 'avsig1' || b.version !== 'avsig1') {
    return { comparable: false, duplicate: false, score: 0, threshold, reason: 'unsupported_signature_version' }
  }
  if (!durationRatioOk(a.meta?.durationSec, b.meta?.durationSec)) {
    return { comparable: true, duplicate: false, score: 0, threshold, reason: 'duration_mismatch' }
  }

  const videoScore = compareFrameHashes(a.video?.hashes || [], b.video?.hashes || [])
  const audioScore = compareAudioBins(a.audio?.bins || [], b.audio?.bins || [])
  const scores = [videoScore, audioScore].filter((v): v is number => typeof v === 'number')
  if (scores.length === 0) {
    return { comparable: false, duplicate: false, score: 0, threshold, reason: 'no_comparable_tracks' }
  }

  let score = 0
  if (typeof videoScore === 'number' && typeof audioScore === 'number') {
    score = videoScore * 0.6 + audioScore * 0.4
  } else {
    score = scores[0]
  }

  return {
    comparable: true,
    duplicate: score >= threshold,
    score,
    threshold,
    videoScore,
    audioScore,
    reason: score >= threshold ? 'av_similarity_match' : 'below_threshold',
  }
}

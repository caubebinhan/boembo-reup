/**
 * Video Edit Troubleshooting Handlers
 * ────────────────────────────────────
 * Real diagnostics for video editing errors (DG-600..612).
 *
 * @module handlers/video-edit.handler
 * @docusaurus Video edit troubleshooting reference
 */
import { execSync } from 'node:child_process'

export interface HandlerResult {
  success: boolean
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

type LogFn = (msg: string) => void

// ── DG-610: FFmpeg pipeline check ───────────────
/** @troubleshootHandler video-edit.ffmpeg-pipeline-check */
export async function troubleshootFfmpegPipelineCheck(logger: LogFn): Promise<HandlerResult> {
  logger('✂️ Kiểm tra FFmpeg pipeline...')
  const details: Record<string, string | boolean> = {}

  // Check FFmpeg version + codecs
  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 })
    details.ffmpegVersion = (version.split('\n')[0] || '').trim()
    logger(`✅ FFmpeg: ${details.ffmpegVersion}`)
  } catch {
    details.ffmpegFound = false
    logger('❌ FFmpeg not found')
    return { success: false, title: 'FFmpeg không tìm thấy', message: 'Cài đặt FFmpeg trước khi sử dụng tính năng chỉnh sửa video.', details }
  }

  // Check H.264 encoder support
  try {
    const encoders = execSync('ffmpeg -encoders 2>&1', { encoding: 'utf-8', timeout: 5000 })
    details.hasH264 = encoders.includes('libx264')
    details.hasAAC = encoders.includes('aac')
    logger(details.hasH264 ? '✅ Encoder H.264 (libx264): có' : '❌ Encoder H.264: thiếu')
    logger(details.hasAAC ? '✅ Encoder AAC: có' : '⚠️ Encoder AAC: thiếu')
  } catch {
    logger('⚠️ Không kiểm tra được danh sách encoder')
  }

  // Check available filters
  try {
    const filters = execSync('ffmpeg -filters 2>&1', { encoding: 'utf-8', timeout: 5000 })
    details.hasScale = filters.includes('scale')
    details.hasCrop = filters.includes('crop')
    details.hasRotate = filters.includes('rotate')
    logger(`✅ Filters: scale=${details.hasScale}, crop=${details.hasCrop}, rotate=${details.hasRotate}`)
  } catch {
    logger('⚠️ Không kiểm tra được danh sách filter')
  }

  const allGood = details.hasH264 !== false
  return {
    success: allGood,
    title: allGood ? 'FFmpeg pipeline OK' : 'FFmpeg thiếu encoder',
    message: allGood
      ? `FFmpeg hoạt động với đầy đủ encoder và filter. ${details.ffmpegVersion}`
      : 'FFmpeg thiếu encoder H.264 (libx264). Cài lại FFmpeg bản đầy đủ.',
    details,
  }
}

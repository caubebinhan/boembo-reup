/** @errorCode DG-001 — FFmpeg not available
 * @troubleshootHandler DG-001
 * Checks: ffmpeg -version, ffprobe -version, PATH
 */
import { execSync } from 'node:child_process'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🎬 Kiểm tra FFmpeg...')
  const details: Record<string, string | boolean> = {}

  try {
    const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 })
    const versionLine = ffmpegVersion.split('\n')[0] || 'unknown'
    details.ffmpegVersion = versionLine.trim()
    details.ffmpegFound = true
    logger(`✅ FFmpeg: ${versionLine.trim()}`)
  } catch {
    details.ffmpegFound = false
    logger('❌ FFmpeg không tìm thấy trên PATH')
    return { success: false, title: 'FFmpeg chưa cài đặt', message: 'Không tìm thấy FFmpeg. Tải từ https://ffmpeg.org và thêm vào PATH.', details }
  }

  try {
    const ffprobeVersion = execSync('ffprobe -version', { encoding: 'utf-8', timeout: 5000 })
    details.ffprobeFound = true
    logger(`✅ FFprobe: ${(ffprobeVersion.split('\n')[0] || '').trim()}`)
  } catch {
    details.ffprobeFound = false
    logger('⚠️ FFprobe không tìm thấy')
  }

  return { success: true, title: 'FFmpeg hoạt động bình thường', message: `FFmpeg đã cài: ${details.ffmpegVersion}`, details }
}

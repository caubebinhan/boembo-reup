/** @errorCode DG-610 — Video editing pipeline failed
 * @troubleshootHandler DG-610
 * Checks: FFmpeg version, H.264/AAC encoder, filters
 */
import { execSync } from 'node:child_process'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('✂️ Kiểm tra FFmpeg pipeline...')
  const details: Record<string, string | boolean> = {}

  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 })
    details.ffmpegVersion = (version.split('\n')[0] || '').trim()
    logger(`✅ FFmpeg: ${details.ffmpegVersion}`)
  } catch {
    return { success: false, title: 'FFmpeg không tìm thấy', message: 'Cài đặt FFmpeg trước.', details }
  }

  try {
    const encoders = execSync('ffmpeg -encoders 2>&1', { encoding: 'utf-8', timeout: 5000 })
    details.hasH264 = encoders.includes('libx264')
    details.hasAAC = encoders.includes('aac')
    logger(`Encoder: H.264=${details.hasH264 ? '✅' : '❌'}, AAC=${details.hasAAC ? '✅' : '❌'}`)
  } catch { logger('⚠️ Không kiểm tra được encoder') }

  try {
    const filters = execSync('ffmpeg -filters 2>&1', { encoding: 'utf-8', timeout: 5000 })
    details.hasScale = filters.includes('scale')
    details.hasCrop = filters.includes('crop')
    details.hasRotate = filters.includes('rotate')
    logger(`Filters: scale=${details.hasScale}, crop=${details.hasCrop}, rotate=${details.hasRotate}`)
  } catch { logger('⚠️ Không kiểm tra được filter') }

  const allGood = details.hasH264 !== false
  return {
    success: allGood,
    title: allGood ? 'FFmpeg pipeline OK' : 'FFmpeg thiếu encoder',
    message: allGood ? `FFmpeg đầy đủ. ${details.ffmpegVersion}` : 'Thiếu encoder H.264. Cài lại FFmpeg bản đầy đủ.',
    details,
  }
}

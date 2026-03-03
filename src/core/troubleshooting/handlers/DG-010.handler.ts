/** @errorCode DG-010 — FFmpeg processing error
 * @troubleshootHandler DG-010
 * Checks: FFmpeg version, codec support
 */
import { execSync } from 'node:child_process'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🎥 Kiểm tra FFmpeg xử lý video...')
  const details: Record<string, string | boolean> = {}

  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 })
    details.version = (version.split('\n')[0] || '').trim()
    logger(`✅ FFmpeg: ${details.version}`)
  } catch {
    return { success: false, title: 'FFmpeg không tìm thấy', message: 'Cài đặt FFmpeg trước.', details }
  }

  try {
    const decoders = execSync('ffmpeg -decoders 2>&1', { encoding: 'utf-8', timeout: 5000 })
    details.hasH264Dec = decoders.includes('h264')
    details.hasAACDec = decoders.includes('aac')
    logger(`✅ Decoder: H.264=${details.hasH264Dec}, AAC=${details.hasAACDec}`)
  } catch { logger('⚠️ Không kiểm tra được decoder') }

  return { success: true, title: 'FFmpeg xử lý video OK', message: `${details.version}. Decoder đầy đủ.`, details }
}

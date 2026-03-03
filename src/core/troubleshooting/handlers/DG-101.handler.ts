/** @errorCode DG-101 — TikTok CAPTCHA detected
 * @troubleshootHandler DG-101
 * Checks: TikTok rate limiting (HTTP 429), upload page status
 */
import { net } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🧩 Kiểm tra CAPTCHA / rate-limit...')
  const details: Record<string, string | boolean> = {}

  try {
    const response = await net.fetch('https://www.tiktok.com/creator#/upload', { method: 'HEAD', redirect: 'manual' })
    details.uploadPageStatus = String(response.status)
    details.hasRateLimit = response.status === 429

    if (response.status === 429) {
      logger('⚠️ TikTok rate-limit (429)')
      return { success: false, title: 'TikTok đang giới hạn truy cập', message: 'Đợi 30 phút rồi thử lại, hoặc tăng interval.', details }
    }

    logger(`✅ Trang upload: HTTP ${response.status}`)
    return { success: true, title: 'Không phát hiện CAPTCHA', message: 'Trang upload phản hồi bình thường. Thử publish lại.', details }
  } catch (err: any) {
    details.error = err.message
    return { success: false, title: 'Không kiểm tra được', message: 'Không thể truy cập trang upload TikTok.', details }
  }
}

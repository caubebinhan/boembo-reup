/** @errorCode DG-100 — TikTok session expired
 * @troubleshootHandler DG-100
 * Checks: TikTok Studio accessibility, redirect to login
 */
import { net } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🔑 Kiểm tra phiên đăng nhập TikTok...')
  const details: Record<string, string | boolean | number> = {}

  try {
    const response = await net.fetch('https://studio.tiktok.com', { method: 'GET', redirect: 'manual' })
    details.studioStatus = response.status
    const location = response.headers.get('location') || ''
    details.redirectsToLogin = location.includes('login')

    if (details.redirectsToLogin) {
      logger('❌ TikTok Studio chuyển hướng đến trang đăng nhập')
      return { success: false, title: 'Phiên đăng nhập đã hết hạn', message: 'TikTok Studio yêu cầu đăng nhập lại. Mở Settings → Accounts.', details }
    }

    logger(`✅ TikTok Studio phản hồi: HTTP ${response.status}`)
    return { success: true, title: 'TikTok Studio truy cập được', message: 'Phiên đăng nhập có thể vẫn hợp lệ.', details }
  } catch (err: any) {
    details.error = err.message
    logger(`❌ Không kết nối được: ${err.message}`)
    return { success: false, title: 'Không kết nối được TikTok Studio', message: 'Kiểm tra kết nối mạng.', details }
  }
}

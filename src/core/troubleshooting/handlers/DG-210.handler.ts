/** @errorCode DG-210 — Video download failed
 * @troubleshootHandler DG-210
 * Checks: TikTok CDN endpoint connectivity
 */
import { net } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('⬇️ Kiểm tra khả năng tải video...')
  const details: Record<string, string | boolean | number> = {}
  const cdnEndpoints = [
    'https://v16-webapp-prime.us.tiktok.com',
    'https://v19.tiktokcdn.com',
  ]

  let anyReachable = false
  for (const cdn of cdnEndpoints) {
    try {
      const start = Date.now()
      const response = await net.fetch(cdn, { method: 'HEAD' })
      const latency = Date.now() - start
      const domain = new URL(cdn).hostname
      details[`${domain}_status`] = response.status
      details[`${domain}_latencyMs`] = latency
      logger(`${response.status < 500 ? '✅' : '⚠️'} CDN ${domain}: HTTP ${response.status} (${latency}ms)`)
      anyReachable = true
    } catch {
      const domain = new URL(cdn).hostname
      details[`${domain}_ok`] = false
      logger(`❌ CDN ${domain}: không kết nối được`)
    }
  }

  return {
    success: anyReachable,
    title: anyReachable ? 'CDN TikTok truy cập được' : 'CDN không truy cập được',
    message: anyReachable ? 'Server tải video hoạt động. Lỗi có thể do video bị xóa.' : 'Không kết nối được CDN. Kiểm tra mạng/VPN.',
    details,
  }
}

/** @errorCode DG-006 — Network connectivity failed
 * @troubleshootHandler DG-006
 * Checks: HEAD to Google, TikTok, TikTok Studio with latency
 */
import { net } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🌐 Kiểm tra kết nối mạng...')
  const details: Record<string, string | boolean | number> = {}
  const endpoints = [
    { name: 'Google', url: 'https://www.google.com' },
    { name: 'TikTok', url: 'https://www.tiktok.com' },
    { name: 'TikTok Studio', url: 'https://studio.tiktok.com' },
  ]

  let anySuccess = false
  for (const ep of endpoints) {
    try {
      const start = Date.now()
      const response = await net.fetch(ep.url, { method: 'HEAD' })
      const latency = Date.now() - start
      details[`${ep.name}_status`] = response.status
      details[`${ep.name}_latencyMs`] = latency
      details[`${ep.name}_ok`] = response.ok
      logger(`${response.ok ? '✅' : '⚠️'} ${ep.name}: ${response.status} (${latency}ms)`)
      if (response.ok) anySuccess = true
    } catch (err: any) {
      details[`${ep.name}_ok`] = false
      logger(`❌ ${ep.name}: không kết nối được`)
    }
  }

  return {
    success: anySuccess,
    title: anySuccess ? 'Mạng hoạt động bình thường' : 'Không có kết nối mạng',
    message: anySuccess ? 'Kết nối Internet hoạt động.' : 'Không thể kết nối. Kiểm tra WiFi/Ethernet.',
    details,
  }
}

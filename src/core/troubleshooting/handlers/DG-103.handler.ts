/** @errorCode DG-103 — Upload timeout
 * @troubleshootHandler DG-103
 * Checks: Network speed to TikTok CDN
 */
import { net } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('⏱ Kiểm tra tốc độ upload...')
  const details: Record<string, string | number | boolean> = {}

  const endpoints = [
    { name: 'TikTok CDN', url: 'https://www.tiktok.com' },
    { name: 'Google', url: 'https://www.google.com' },
  ]

  for (const ep of endpoints) {
    try {
      const start = Date.now()
      const response = await net.fetch(ep.url, { method: 'HEAD' })
      const latency = Date.now() - start
      details[`${ep.name}_latencyMs`] = latency
      details[`${ep.name}_ok`] = response.ok
      logger(`${latency > 3000 ? '⚠️' : '✅'} ${ep.name}: ${latency}ms`)
    } catch {
      details[`${ep.name}_ok`] = false
      logger(`❌ ${ep.name}: không kết nối`)
    }
  }

  const tiktokLatency = details['TikTok CDN_latencyMs'] as number
  const slow = tiktokLatency > 3000
  return {
    success: !slow,
    title: slow ? 'Kết nối chậm đến TikTok' : 'Tốc độ mạng bình thường',
    message: slow ? `Latency ${tiktokLatency}ms. Kiểm tra mạng hoặc giảm chất lượng video.` : `Latency ${tiktokLatency}ms — bình thường.`,
    details,
  }
}

/** @errorCode DG-200 — No videos found from source
 * @troubleshootHandler DG-200
 * Checks: TikTok page accessibility
 */
import { net } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🔍 Kiểm tra truy cập nguồn TikTok...')
  const details: Record<string, string | boolean | number> = {}

  try {
    const start = Date.now()
    const response = await net.fetch('https://www.tiktok.com/@tiktok', { method: 'HEAD' })
    details.tiktokStatus = response.status
    details.latencyMs = Date.now() - start
    details.accessible = response.ok
    logger(`${response.ok ? '✅' : '⚠️'} TikTok: HTTP ${response.status} (${details.latencyMs}ms)`)

    if (!response.ok) {
      return { success: false, title: 'TikTok không truy cập được', message: `HTTP ${response.status}. Có thể do mạng hoặc IP bị chặn.`, details }
    }
    return { success: true, title: 'TikTok truy cập được', message: `Có thể truy cập TikTok (${details.latencyMs}ms).`, details }
  } catch (err: any) {
    details.error = err.message
    return { success: false, title: 'Không kết nối được TikTok', message: 'Kiểm tra kết nối mạng.', details }
  }
}

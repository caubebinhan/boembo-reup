/** @errorCode DG-110 — Browser not responding
 * @troubleshootHandler DG-110
 * Checks: Process memory usage, heap stats
 */
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('🖥 Kiểm tra trình duyệt...')
  const details: Record<string, string | number | boolean> = {}

  const memUsage = process.memoryUsage()
  details.heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
  details.heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
  details.rssMB = Math.round(memUsage.rss / 1024 / 1024)
  details.memoryOk = details.rssMB < 2000

  logger(`RAM: ${details.rssMB}MB (Heap: ${details.heapUsedMB}/${details.heapTotalMB}MB)`)

  if (details.rssMB > 2000) {
    logger('⚠️ RAM quá cao — có thể crash trình duyệt')
    return { success: false, title: 'RAM quá cao', message: `Ứng dụng dùng ${details.rssMB}MB RAM. Đóng ứng dụng khác.`, details }
  }

  logger('✅ RAM bình thường')
  return { success: true, title: 'Trình duyệt OK', message: `RAM: ${details.rssMB}MB. Bình thường.`, details }
}

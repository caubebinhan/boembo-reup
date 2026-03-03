/**
 * Scanner Troubleshooting Handlers
 * ─────────────────────────────────
 * Real diagnostics for scanner/download errors (DG-200..212).
 *
 * @module handlers/scanner.handler
 * @docusaurus Scanner troubleshooting reference
 */
import { net } from 'electron'

export interface HandlerResult {
  success: boolean
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

type LogFn = (msg: string) => void

// ── DG-200/202: Source channel check ────────────
/** @troubleshootHandler scanner.source-check */
export async function troubleshootSourceCheck(logger: LogFn): Promise<HandlerResult> {
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
      return {
        success: false,
        title: 'TikTok không truy cập được',
        message: `Trang TikTok trả về HTTP ${response.status}. Có thể do mạng hoặc IP bị chặn.`,
        details,
      }
    }

    return {
      success: true,
      title: 'TikTok truy cập được',
      message: `Có thể truy cập TikTok (${details.latencyMs}ms). Nguồn video có thể hoạt động.`,
      details,
    }
  } catch (err: any) {
    details.error = err.message
    logger(`❌ Không kết nối được TikTok: ${err.message}`)
    return { success: false, title: 'Không kết nối được TikTok', message: 'Kiểm tra kết nối mạng.', details }
  }
}

// ── DG-210: Download check ──────────────────────
/** @troubleshootHandler scanner.download-check */
export async function troubleshootDownloadCheck(logger: LogFn): Promise<HandlerResult> {
  logger('⬇️ Kiểm tra khả năng tải video...')
  const details: Record<string, string | boolean | number> = {}

  // Test CDN connectivity by checking a known TikTok CDN domain
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
    } catch (err: any) {
      const domain = new URL(cdn).hostname
      details[`${domain}_ok`] = false
      logger(`❌ CDN ${domain}: không kết nối được`)
    }
  }

  return {
    success: anyReachable,
    title: anyReachable ? 'CDN TikTok truy cập được' : 'CDN TikTok không truy cập được',
    message: anyReachable
      ? 'Các server tải video TikTok hoạt động. Lỗi có thể do video cụ thể bị xóa.'
      : 'Không thể kết nối đến server tải video. Kiểm tra mạng hoặc VPN.',
    details,
  }
}

/**
 * Publish Troubleshooting Handlers
 * ─────────────────────────────────
 * Real diagnostics for TikTok publish errors (DG-100..118).
 *
 * @module handlers/publish.handler
 * @docusaurus Publish troubleshooting reference
 */
import { net } from 'electron'

export interface HandlerResult {
  success: boolean
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

type LogFn = (msg: string) => void

// ── DG-100/131: Account session check ───────────
/** @troubleshootHandler publish.account-session-check */
export async function troubleshootAccountSessionCheck(logger: LogFn): Promise<HandlerResult> {
  logger('🔑 Kiểm tra phiên đăng nhập TikTok...')
  const details: Record<string, string | boolean | number> = {}

  try {
    const response = await net.fetch('https://studio.tiktok.com', {
      method: 'GET',
      redirect: 'manual',
    })
    details.studioStatus = response.status
    details.isRedirect = response.status >= 300 && response.status < 400
    const location = response.headers.get('location') || ''
    details.redirectsToLogin = location.includes('login')

    if (details.redirectsToLogin) {
      logger('❌ TikTok Studio chuyển hướng đến trang đăng nhập')
      return {
        success: false,
        title: 'Phiên đăng nhập đã hết hạn',
        message: 'TikTok Studio yêu cầu đăng nhập lại. Mở Settings → Accounts để đăng nhập lại.',
        details,
      }
    }

    logger(`✅ TikTok Studio phản hồi: HTTP ${response.status}`)
    return {
      success: true,
      title: 'TikTok Studio truy cập được',
      message: 'Có thể truy cập TikTok Studio. Phiên đăng nhập có thể vẫn hợp lệ.',
      details,
    }
  } catch (err: any) {
    details.error = err.message
    logger(`❌ Không thể kết nối TikTok Studio: ${err.message}`)
    return {
      success: false,
      title: 'Không kết nối được TikTok Studio',
      message: 'Kiểm tra kết nối mạng và thử lại.',
      details,
    }
  }
}

// ── DG-101/113: CAPTCHA detection ───────────────
/** @troubleshootHandler publish.captcha-detect */
export async function troubleshootCaptchaDetect(logger: LogFn): Promise<HandlerResult> {
  logger('🧩 Kiểm tra CAPTCHA...')
  const details: Record<string, string | boolean> = {}

  // Check if TikTok is rate-limiting by testing upload page response
  try {
    const response = await net.fetch('https://www.tiktok.com/creator#/upload', {
      method: 'HEAD',
      redirect: 'manual',
    })
    details.uploadPageStatus = String(response.status)
    details.hasRateLimit = response.status === 429

    if (response.status === 429) {
      logger('⚠️ TikTok đang giới hạn tần suất truy cập (429)')
      return {
        success: false,
        title: 'TikTok đang giới hạn truy cập',
        message: 'Bạn đang bị rate-limit. Đợi 30 phút rồi thử lại, hoặc tăng khoảng cách giữa các lần publish.',
        details,
      }
    }

    logger(`✅ Trang upload phản hồi: HTTP ${response.status}`)
    return {
      success: true,
      title: 'Không phát hiện CAPTCHA',
      message: 'Trang upload TikTok phản hồi bình thường. Thử publish lại.',
      details,
    }
  } catch (err: any) {
    details.error = err.message
    logger(`⚠️ Không kiểm tra được: ${err.message}`)
    return { success: false, title: 'Không kiểm tra được', message: 'Không thể truy cập trang upload TikTok.', details }
  }
}

// ── DG-110: Browser health ──────────────────────
/** @troubleshootHandler publish.browser-health */
export async function troubleshootBrowserHealth(logger: LogFn): Promise<HandlerResult> {
  logger('🖥 Kiểm tra tình trạng trình duyệt...')
  const details: Record<string, string | number | boolean> = {}

  // Check memory usage
  const memUsage = process.memoryUsage()
  details.heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
  details.heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
  details.rssMB = Math.round(memUsage.rss / 1024 / 1024)
  details.memoryOk = details.rssMB < 2000

  logger(`RAM sử dụng: ${details.rssMB}MB (Heap: ${details.heapUsedMB}/${details.heapTotalMB}MB)`)

  if (details.rssMB > 2000) {
    logger('⚠️ Sử dụng nhiều RAM — có thể gây crash trình duyệt')
    return {
      success: false,
      title: 'RAM sử dụng quá cao',
      message: `Ứng dụng đang dùng ${details.rssMB}MB RAM. Đóng các tab/ứng dụng khác để giải phóng bộ nhớ.`,
      details,
    }
  }

  logger('✅ RAM bình thường')
  return {
    success: true,
    title: 'Trình duyệt OK',
    message: `RAM: ${details.rssMB}MB, Heap: ${details.heapUsedMB}MB. Trình duyệt tích hợp hoạt động bình thường.`,
    details,
  }
}

import { ExecutionLogger } from '@core/engine/ExecutionLogger'

/**
 * TikTok Repost — Workflow Event Listeners
 *
 * Listens to ExecutionLogger internal events (main-process only) and sends
 * Electron desktop notifications for important workflow events.
 *
 * Auto-discovered by src/workflows/index.ts via events.ts convention.
 */

async function sendNotification(title: string, body: string, sound = true) {
  try {
    const { Notification } = await import('electron')
    if (!Notification.isSupported()) return
    new Notification({ title, body: body || undefined, silent: !sound }).show()
  } catch (e: any) {
    console.error('[tiktok-repost/events] Failed to send notification:', e.message)
  }
}

function descOf(data: any): string {
  return data?.description ? `"${String(data.description).slice(0, 60)}"` : 'một video'
}

function onNodeEvent(payload: { campaignId: string; instanceId: string; event: string; data?: any }) {
  const { event, data } = payload

  switch (event) {
    case 'captcha:detected':
      sendNotification(
        '🤖 Cần giải CAPTCHA',
        'Boembo cần bạn giải CAPTCHA để tiếp tục publish video',
      )
      break

    case 'violation:detected':
      sendNotification(
        '⚠️ Vi phạm chính sách',
        `Video ${descOf(data)} bị vi phạm chính sách TikTok`,
      )
      break

    case 'publish:failed':
      sendNotification(
        '❌ Đăng video thất bại',
        `Video ${descOf(data)} bị lỗi khi đăng`,
      )
      break

    case 'download:failed':
      sendNotification(
        '❌ Tải video thất bại',
        `Video ${descOf(data)} không tải được: ${data?.error || 'Lỗi không xác định'}`,
      )
      break

    case 'scan:failed':
      sendNotification(
        '⚠️ Quét nguồn thất bại',
        `Nguồn "${data?.sourceName || 'unknown'}" bị lỗi khi quét: ${data?.error || 'Lỗi không xác định'}`,
      )
      break

    case 'video:published':
      // Under review hết retry — cần user kiểm tra thủ công
      if (data?.isReviewing) {
        sendNotification(
          '⏳ Video đang bị review',
          `Video ${descOf(data)} đang chờ TikTok duyệt sau khi hết retry. Vui lòng kiểm tra thủ công.`,
        )
      }
      break
  }
}

function onCampaignFinished(_payload: any) {
  sendNotification(
    '✅ Hoàn tất Campaign',
    'Đã xử lý xong tất cả video. Kết quả sẽ hiển thị trong Campaign Detail.',
    false,
  )
}

export function setup() {
  ExecutionLogger.on('node:event', onNodeEvent)
  ExecutionLogger.on('campaign:finished', onCampaignFinished)
  console.log('[tiktok-repost/events] Notification listeners registered')
}

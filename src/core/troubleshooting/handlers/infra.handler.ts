/**
 * Infrastructure Troubleshooting Handlers
 * ────────────────────────────────────────
 * Real diagnostic functions for core infrastructure errors (DG-001..006).
 * Each handler runs actual checks and returns user-friendly results.
 *
 * @module handlers/infra.handler
 * @docusaurus Infrastructure troubleshooting reference
 */
import { existsSync, accessSync, constants, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { app } from 'electron'
import { net } from 'electron'

export interface HandlerResult {
  success: boolean
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

type LogFn = (msg: string) => void

// ── DG-001: FFmpeg check ────────────────────────
/** @troubleshootHandler infra.ffmpeg-check */
export async function troubleshootFFmpegCheck(logger: LogFn): Promise<HandlerResult> {
  logger('🎬 Kiểm tra FFmpeg...')
  const details: Record<string, string | boolean> = {}

  try {
    const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 })
    const versionLine = ffmpegVersion.split('\n')[0] || 'unknown'
    details.ffmpegVersion = versionLine.trim()
    details.ffmpegFound = true
    logger(`✅ FFmpeg: ${versionLine.trim()}`)
  } catch {
    details.ffmpegFound = false
    logger('❌ FFmpeg không tìm thấy trên PATH')
    return {
      success: false,
      title: 'FFmpeg chưa cài đặt',
      message: 'Không tìm thấy FFmpeg trên máy tính. Hãy tải FFmpeg từ https://ffmpeg.org và thêm vào PATH.',
      details,
    }
  }

  try {
    const ffprobeVersion = execSync('ffprobe -version', { encoding: 'utf-8', timeout: 5000 })
    details.ffprobeFound = true
    logger(`✅ FFprobe: ${(ffprobeVersion.split('\n')[0] || '').trim()}`)
  } catch {
    details.ffprobeFound = false
    logger('⚠️ FFprobe không tìm thấy')
  }

  return {
    success: true,
    title: 'FFmpeg hoạt động bình thường',
    message: `FFmpeg đã được cài đặt: ${details.ffmpegVersion}`,
    details,
  }
}

// ── DG-002: Database check ──────────────────────
/** @troubleshootHandler infra.db-check */
export async function troubleshootDbCheck(logger: LogFn): Promise<HandlerResult> {
  logger('💾 Kiểm tra cơ sở dữ liệu...')
  const userDataPath = app.getPath('userData')
  const dbPath = resolve(userDataPath, 'boembo.db')
  const details: Record<string, string | number | boolean> = {}

  details.dbPath = dbPath
  details.dbExists = existsSync(dbPath)

  if (!details.dbExists) {
    logger('❌ File database không tồn tại')
    return {
      success: false,
      title: 'Database không tìm thấy',
      message: `File database không tồn tại tại ${dbPath}. Thử khởi động lại ứng dụng.`,
      details,
    }
  }

  try {
    const stat = statSync(dbPath)
    details.dbSizeBytes = stat.size
    details.dbSizeMB = Math.round(stat.size / 1024 / 1024 * 100) / 100
    logger(`✅ Database tồn tại: ${details.dbSizeMB}MB`)
  } catch (err: any) {
    logger(`❌ Không đọc được database: ${err.message}`)
    return { success: false, title: 'Database bị khóa', message: 'Không thể truy cập file database. Có thể đang bị ứng dụng khác sử dụng.', details }
  }

  // Check disk space
  try {
    const drive = dbPath.split(':')[0] + ':'
    const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /format:value`, { encoding: 'utf-8', timeout: 3000 })
    const freeMatch = output.match(/FreeSpace=(\d+)/)
    if (freeMatch) {
      const freeMB = Math.round(parseInt(freeMatch[1]) / 1024 / 1024)
      details.diskFreeMB = freeMB
      details.diskOk = freeMB > 500
      logger(freeMB > 500 ? `✅ Dung lượng ổ đĩa: ${freeMB}MB trống` : `⚠️ Ổ đĩa gần đầy: chỉ còn ${freeMB}MB`)
    }
  } catch { logger('⚠️ Không kiểm tra được dung lượng ổ đĩa') }

  return {
    success: true,
    title: 'Database hoạt động bình thường',
    message: `Database ${details.dbSizeMB}MB tại ${dbPath}. Ổ đĩa còn ${details.diskFreeMB || '?'}MB trống.`,
    details,
  }
}

// ── DG-003: Media directory check ───────────────
/** @troubleshootHandler infra.media-dir-check */
export async function troubleshootMediaDirCheck(logger: LogFn): Promise<HandlerResult> {
  logger('📂 Kiểm tra thư mục media...')
  const userDataPath = app.getPath('userData')
  const mediaPath = resolve(userDataPath, 'media')
  const details: Record<string, string | boolean> = {}

  details.mediaPath = mediaPath
  details.exists = existsSync(mediaPath)

  if (!details.exists) {
    logger('❌ Thư mục media không tồn tại')
    return { success: false, title: 'Thư mục media không tồn tại', message: `Thư mục ${mediaPath} không tìm thấy. Kiểm tra Settings → Media Path.`, details }
  }

  try {
    accessSync(mediaPath, constants.W_OK)
    details.writable = true
    logger('✅ Thư mục media có quyền ghi')
  } catch {
    details.writable = false
    logger('❌ Không có quyền ghi vào thư mục media')
    return { success: false, title: 'Thư mục media không ghi được', message: `Thư mục ${mediaPath} tồn tại nhưng không có quyền ghi.`, details }
  }

  return { success: true, title: 'Thư mục media OK', message: `Thư mục media hoạt động: ${mediaPath}`, details }
}

// ── DG-006: Network check ───────────────────────
/** @troubleshootHandler infra.network-check */
export async function troubleshootNetworkCheck(logger: LogFn): Promise<HandlerResult> {
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
      details[`${ep.name}_error`] = err.message || 'failed'
      logger(`❌ ${ep.name}: không kết nối được`)
    }
  }

  return {
    success: anySuccess,
    title: anySuccess ? 'Mạng hoạt động bình thường' : 'Không có kết nối mạng',
    message: anySuccess
      ? 'Kết nối Internet hoạt động. Các dịch vụ chính đều truy cập được.'
      : 'Không thể kết nối đến bất kỳ dịch vụ nào. Kiểm tra WiFi/Ethernet và thử lại.',
    details,
  }
}

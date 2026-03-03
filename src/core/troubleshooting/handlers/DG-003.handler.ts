/** @errorCode DG-003 — Media directory not writable
 * @troubleshootHandler DG-003
 * Checks: directory exists, write permission
 */
import { existsSync, accessSync, constants } from 'node:fs'
import { resolve } from 'node:path'
import { app } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
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
    logger('❌ Không có quyền ghi')
    return { success: false, title: 'Thư mục media không ghi được', message: `Thư mục ${mediaPath} tồn tại nhưng không có quyền ghi.`, details }
  }

  return { success: true, title: 'Thư mục media OK', message: `Thư mục media hoạt động: ${mediaPath}`, details }
}

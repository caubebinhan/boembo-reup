/** @errorCode DG-002 — Database connection failed
 * @troubleshootHandler DG-002
 * Checks: DB file exists, size, disk space
 */
import { existsSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { app } from 'electron'
import type { HandlerResult, LogFn } from './types'

export default async function handler(logger: LogFn): Promise<HandlerResult> {
  logger('💾 Kiểm tra cơ sở dữ liệu...')
  const userDataPath = app.getPath('userData')
  const dbPath = resolve(userDataPath, 'boembo.db')
  const details: Record<string, string | number | boolean> = {}

  details.dbPath = dbPath
  details.dbExists = existsSync(dbPath)

  if (!details.dbExists) {
    logger('❌ File database không tồn tại')
    return { success: false, title: 'Database không tìm thấy', message: `File database không tồn tại tại ${dbPath}. Thử khởi động lại ứng dụng.`, details }
  }

  try {
    const stat = statSync(dbPath)
    details.dbSizeMB = Math.round(stat.size / 1024 / 1024 * 100) / 100
    logger(`✅ Database tồn tại: ${details.dbSizeMB}MB`)
  } catch (err: any) {
    logger(`❌ Không đọc được database: ${err.message}`)
    return { success: false, title: 'Database bị khóa', message: 'Không thể truy cập file database.', details }
  }

  try {
    const drive = dbPath.split(':')[0] + ':'
    const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /format:value`, { encoding: 'utf-8', timeout: 3000 })
    const freeMatch = output.match(/FreeSpace=(\d+)/)
    if (freeMatch) {
      const freeMB = Math.round(parseInt(freeMatch[1]) / 1024 / 1024)
      details.diskFreeMB = freeMB
      details.diskOk = freeMB > 500
      logger(freeMB > 500 ? `✅ Dung lượng: ${freeMB}MB trống` : `⚠️ Ổ đĩa gần đầy: ${freeMB}MB`)
    }
  } catch { logger('⚠️ Không kiểm tra được dung lượng ổ đĩa') }

  return { success: true, title: 'Database OK', message: `Database ${details.dbSizeMB}MB, ổ đĩa còn ${details.diskFreeMB || '?'}MB trống.`, details }
}

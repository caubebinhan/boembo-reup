import { execSync } from 'child_process'
import * as path from 'path'
import * as os from 'os'

/**
 * Cross-platform free disk space check.
 * Returns free space in MB for the drive/volume containing the given path.
 * Works on Windows (wmic/PowerShell) and macOS/Linux (df).
 *
 * @param targetPath - Any path on the target disk/volume
 * @returns Free space in MB, or -1 on error
 */
export async function getFreeDiskSpaceMB(targetPath: string): Promise<number> {
  const platform = os.platform()

  if (platform === 'win32') {
    return getFreeDiskSpaceWindows(targetPath)
  } else {
    return getFreeDiskSpacePosix(targetPath)
  }
}

/** Windows: use PowerShell Get-PSDrive (works on all modern Windows) */
function getFreeDiskSpaceWindows(targetPath: string): number {
  const drive = path.parse(targetPath).root.replace('\\', '').replace(':', '')
  try {
    // Try PowerShell first (more reliable than wmic which is deprecated)
    const output = execSync(
      `powershell -NoProfile -Command "(Get-PSDrive ${drive}).Free"`,
      { encoding: 'utf8', timeout: 5000 }
    )
    const freeBytes = parseInt(output.trim(), 10)
    if (isFinite(freeBytes) && freeBytes > 0) {
      return Math.round(freeBytes / (1024 * 1024))
    }
  } catch {
    // Fallback: wmic (deprecated but widely available)
    try {
      const output = execSync(
        `wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace /value`,
        { encoding: 'utf8', timeout: 5000 }
      )
      const match = output.match(/FreeSpace=(\d+)/)
      if (match) {
        return Math.round(parseInt(match[1], 10) / (1024 * 1024))
      }
    } catch {}
  }
  return -1
}

/** macOS / Linux: use `df -k` */
function getFreeDiskSpacePosix(targetPath: string): number {
  try {
    // df -k <path> outputs:
    // Filesystem  1024-blocks  Used  Available  Capacity  Mounted on
    // /dev/disk1s1  244912536  ...   123456789  ...       /
    const output = execSync(`df -k "${targetPath}"`, { encoding: 'utf8', timeout: 5000 })
    const lines = output.trim().split('\n')
    if (lines.length < 2) return -1

    // Parse the data line — columns are space-separated
    const cols = lines[1].split(/\s+/)
    // Available is usually column index 3 (macOS) — in KB
    const availKB = parseInt(cols[3], 10)
    if (isFinite(availKB) && availKB > 0) {
      return Math.round(availKB / 1024) // KB → MB
    }
  } catch {}
  return -1
}

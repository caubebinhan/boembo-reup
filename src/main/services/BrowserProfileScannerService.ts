import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface LocalBrowserProfile {
  id: string
  directory: string
  displayName: string
  path: string
}

export interface LocalBrowserInstall {
  id: string
  name: string
  executablePath: string
  userDataDir: string
  profiles: LocalBrowserProfile[]
}

type ChromiumBrowserCandidate = {
  id: string
  name: string
  executablePaths: string[]
  userDataDir: string
}

function existsFile(filePath: string): boolean {
  try { return fs.existsSync(filePath) && fs.statSync(filePath).isFile() } catch { return false }
}

function existsDir(dirPath: string): boolean {
  try { return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory() } catch { return false }
}

function readJson(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

export class BrowserProfileScannerService {
  static scanLocalBrowsers(): { platform: string; browsers: LocalBrowserInstall[] } {
    const platform = os.platform()

    let candidates: ChromiumBrowserCandidate[] = []
    if (platform === 'win32') {
      candidates = this.getWindowsCandidates()
    } else if (platform === 'darwin') {
      candidates = this.getDarwinCandidates()
    } else {
      return { platform, browsers: [] }
    }

    const browsers: LocalBrowserInstall[] = []
    for (const c of candidates) {
      const executablePath = c.executablePaths.find(existsFile)
      if (!executablePath) continue

      let profiles = this.scanChromiumProfiles(c.userDataDir)
      if (c.id === 'opera') profiles = this.scanOperaProfiles(c.userDataDir)

      browsers.push({ id: c.id, name: c.name, executablePath, userDataDir: c.userDataDir, profiles })
    }

    return { platform, browsers }
  }

  // ── Windows ───────────────────────────────────────

  private static getWindowsCandidates(): ChromiumBrowserCandidate[] {
    const la = process.env.LOCALAPPDATA || ''
    const ad = process.env.APPDATA || ''
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const p6 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

    return [
      { id: 'chrome', name: 'Google Chrome',
        executablePaths: [path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(p6, 'Google', 'Chrome', 'Application', 'chrome.exe')],
        userDataDir: path.join(la, 'Google', 'Chrome', 'User Data') },
      { id: 'edge', name: 'Microsoft Edge',
        executablePaths: [path.join(p6, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
        userDataDir: path.join(la, 'Microsoft', 'Edge', 'User Data') },
      { id: 'brave', name: 'Brave',
        executablePaths: [path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), path.join(p6, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')],
        userDataDir: path.join(la, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { id: 'vivaldi', name: 'Vivaldi',
        executablePaths: [path.join(la, 'Vivaldi', 'Application', 'vivaldi.exe'), path.join(pf, 'Vivaldi', 'Application', 'vivaldi.exe')],
        userDataDir: path.join(la, 'Vivaldi', 'User Data') },
      { id: 'chromium', name: 'Chromium',
        executablePaths: [path.join(la, 'Chromium', 'Application', 'chrome.exe'), path.join(pf, 'Chromium', 'Application', 'chrome.exe')],
        userDataDir: path.join(la, 'Chromium', 'User Data') },
      { id: 'opera', name: 'Opera',
        executablePaths: [path.join(la, 'Programs', 'Opera', 'opera.exe'), path.join(la, 'Programs', 'Opera GX', 'opera.exe')],
        userDataDir: path.join(ad, 'Opera Software') },
    ]
  }

  // ── macOS ─────────────────────────────────────────

  private static getDarwinCandidates(): ChromiumBrowserCandidate[] {
    const appSupport = path.join(os.homedir(), 'Library', 'Application Support')

    return [
      { id: 'chrome', name: 'Google Chrome',
        executablePaths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
        userDataDir: path.join(appSupport, 'Google', 'Chrome') },
      { id: 'edge', name: 'Microsoft Edge',
        executablePaths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
        userDataDir: path.join(appSupport, 'Microsoft Edge') },
      { id: 'brave', name: 'Brave Browser',
        executablePaths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
        userDataDir: path.join(appSupport, 'BraveSoftware', 'Brave-Browser') },
      { id: 'vivaldi', name: 'Vivaldi',
        executablePaths: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
        userDataDir: path.join(appSupport, 'Vivaldi') },
      { id: 'chromium', name: 'Chromium',
        executablePaths: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
        userDataDir: path.join(appSupport, 'Chromium') },
      { id: 'opera', name: 'Opera',
        executablePaths: ['/Applications/Opera.app/Contents/MacOS/Opera'],
        userDataDir: path.join(appSupport, 'com.operasoftware.Opera') },
    ]
  }

  // ── Profile Scanning ──────────────────────────────

  private static scanChromiumProfiles(userDataDir: string): LocalBrowserProfile[] {
    if (!existsDir(userDataDir)) return []
    const localState = readJson(path.join(userDataDir, 'Local State'))
    const infoCache = localState?.profile?.info_cache || {}

    const profileDirs = fs.readdirSync(userDataDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(name => name === 'Default' || /^Profile \d+$/i.test(name))

    return profileDirs.map((directory) => {
      const info = infoCache[directory] || {}
      const displayName = info.name || (directory === 'Default' ? 'Default' : directory)
      return { id: `${path.basename(userDataDir)}:${directory}`, directory, displayName, path: path.join(userDataDir, directory) }
    })
  }

  private static scanOperaProfiles(rootDir: string): LocalBrowserProfile[] {
    if (!existsDir(rootDir)) return []
    return fs.readdirSync(rootDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^Opera( GX)? Stable$/i.test(d.name))
      .map(d => ({ id: `opera:${d.name}`, directory: d.name, displayName: d.name, path: path.join(rootDir, d.name) }))
  }
}

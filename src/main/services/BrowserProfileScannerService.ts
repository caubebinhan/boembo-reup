import fs from 'fs'
import path from 'path'
import os from 'os'

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
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function existsDir(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export class BrowserProfileScannerService {
  static scanLocalBrowsers(): { platform: string; browsers: LocalBrowserInstall[] } {
    const platform = os.platform()
    if (platform !== 'win32') {
      return { platform, browsers: [] }
    }

    const localAppData = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

    const candidates: ChromiumBrowserCandidate[] = [
      {
        id: 'chrome',
        name: 'Google Chrome',
        executablePaths: [
          path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ],
        userDataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
      },
      {
        id: 'edge',
        name: 'Microsoft Edge',
        executablePaths: [
          path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ],
        userDataDir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
      },
      {
        id: 'brave',
        name: 'Brave',
        executablePaths: [
          path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        ],
        userDataDir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
      },
      {
        id: 'vivaldi',
        name: 'Vivaldi',
        executablePaths: [
          path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe'),
          path.join(programFiles, 'Vivaldi', 'Application', 'vivaldi.exe'),
          path.join(programFilesX86, 'Vivaldi', 'Application', 'vivaldi.exe'),
        ],
        userDataDir: path.join(localAppData, 'Vivaldi', 'User Data'),
      },
      {
        id: 'chromium',
        name: 'Chromium',
        executablePaths: [
          path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
          path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
          path.join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'),
        ],
        userDataDir: path.join(localAppData, 'Chromium', 'User Data'),
      },
      {
        id: 'opera',
        name: 'Opera',
        executablePaths: [
          path.join(localAppData, 'Programs', 'Opera', 'opera.exe'),
          path.join(localAppData, 'Programs', 'Opera GX', 'opera.exe'),
        ],
        userDataDir: path.join(appData, 'Opera Software'),
      },
    ]

    const browsers: LocalBrowserInstall[] = []
    for (const c of candidates) {
      const executablePath = c.executablePaths.find(existsFile)
      if (!executablePath) continue

      let profiles = this.scanChromiumProfiles(c.userDataDir)
      if (c.id === 'opera') {
        profiles = this.scanOperaProfiles(c.userDataDir)
      }

      browsers.push({
        id: c.id,
        name: c.name,
        executablePath,
        userDataDir: c.userDataDir,
        profiles,
      })
    }

    return { platform, browsers }
  }

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
      return {
        id: `${path.basename(userDataDir)}:${directory}`,
        directory,
        displayName,
        path: path.join(userDataDir, directory),
      }
    })
  }

  private static scanOperaProfiles(rootDir: string): LocalBrowserProfile[] {
    if (!existsDir(rootDir)) return []
    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^Opera( GX)? Stable$/i.test(d.name))
      .map(d => d.name)

    return entries.map((directory) => ({
      id: `opera:${directory}`,
      directory,
      displayName: directory,
      path: path.join(rootDir, directory),
    }))
  }
}

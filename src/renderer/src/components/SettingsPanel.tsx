import { useEffect, useMemo, useState } from 'react'

type LocalBrowserProfile = {
  id: string
  directory: string
  displayName: string
  path: string
}

type LocalBrowserInstall = {
  id: string
  name: string
  executablePath: string
  userDataDir: string
  profiles: LocalBrowserProfile[]
}

type ScanResult = {
  platform: string
  browsers: LocalBrowserInstall[]
}

type AutomationBrowserSettings = {
  browserId?: string
  browserName?: string
  executablePath?: string
  userDataDir?: string
  profileDirectory?: string
  profilePath?: string
  locale?: string
}

export function SettingsPanel() {
  const api = (window as any).api
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scan, setScan] = useState<ScanResult>({ platform: 'win32', browsers: [] })
  const [selectedBrowserId, setSelectedBrowserId] = useState('')
  const [selectedProfileDirectory, setSelectedProfileDirectory] = useState('')
  const [locale, setLocale] = useState('en-US')
  const [message, setMessage] = useState<string>('')

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [scanData, current] = await Promise.all([
        api.invoke('browser:scan-local'),
        api.invoke('settings:get-automation-browser'),
      ])
      setScan(scanData || { platform: 'unknown', browsers: [] })

      const settings: AutomationBrowserSettings = current || {}
      setLocale(settings.locale || 'en-US')

      const matchedBrowser = (scanData?.browsers || []).find((b: LocalBrowserInstall) =>
        (settings.browserId && b.id === settings.browserId) ||
        (settings.executablePath && b.executablePath === settings.executablePath)
      )
      setSelectedBrowserId(matchedBrowser?.id || scanData?.browsers?.[0]?.id || '')

      const matchedProfile = matchedBrowser?.profiles?.find((p: LocalBrowserProfile) =>
        (settings.profileDirectory && p.directory === settings.profileDirectory) ||
        (settings.profilePath && p.path === settings.profilePath)
      )
      setSelectedProfileDirectory(matchedProfile?.directory || matchedBrowser?.profiles?.[0]?.directory || '')
    } catch (err) {
      console.error('[SettingsPanel] load failed', err)
      setMessage('Failed to load browser settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selectedBrowser = useMemo(
    () => scan.browsers.find(b => b.id === selectedBrowserId) || null,
    [scan.browsers, selectedBrowserId]
  )

  const selectedProfile = useMemo(
    () => selectedBrowser?.profiles.find(p => p.directory === selectedProfileDirectory) || null,
    [selectedBrowser, selectedProfileDirectory]
  )

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.invoke('settings:set-automation-browser', {
        locale: locale.trim() || 'en-US',
        browserId: selectedBrowser?.id || '',
        browserName: selectedBrowser?.name || '',
        executablePath: selectedBrowser?.executablePath || '',
        userDataDir: selectedBrowser?.userDataDir || '',
        profileDirectory: selectedProfile?.directory || '',
        profilePath: selectedProfile?.path || '',
      })
      setMessage('Saved. Next publish/login automation run will use this browser/profile.')
    } catch (err) {
      console.error('[SettingsPanel] save failed', err)
      setMessage('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 p-6 h-full text-white">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Automation Settings</h1>
            <p className="text-sm text-gray-400 mt-1">
              Choose browser, local profile, and locale for TikTok publish automation.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
          >
            {loading ? 'Scanning...' : 'Rescan Browsers'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-2">
              Browser Language / Locale
            </label>
            <input
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="en-US"
              className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              Affects Playwright `locale`, `Accept-Language`, and Chromium `--lang`.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-2">
              Browser
            </label>
            <select
              value={selectedBrowserId}
              onChange={(e) => {
                const nextId = e.target.value
                setSelectedBrowserId(nextId)
                const nextBrowser = scan.browsers.find(b => b.id === nextId)
                setSelectedProfileDirectory(nextBrowser?.profiles?.[0]?.directory || '')
              }}
              className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500"
            >
              {scan.browsers.length === 0 && <option value="">No supported browsers found</option>}
              {scan.browsers.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {selectedBrowser && (
              <p className="text-xs text-gray-500 mt-2 break-all">{selectedBrowser.executablePath}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">Local Browser Profiles</p>
              <p className="text-xs text-gray-500 mt-1">
                Scanned from local Chromium-family user data. Platform: {scan.platform}
              </p>
            </div>
            <span className="text-xs text-gray-500">
              {selectedBrowser?.profiles.length || 0} profiles
            </span>
          </div>

          {!selectedBrowser ? (
            <div className="text-sm text-gray-500 py-4">Select a browser first.</div>
          ) : selectedBrowser.profiles.length === 0 ? (
            <div className="text-sm text-gray-500 py-4">
              No profiles detected for this browser. Automation will run with a clean context unless you choose a browser that has profiles.
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {selectedBrowser.profiles.map(profile => {
                const active = profile.directory === selectedProfileDirectory
                return (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedProfileDirectory(profile.directory)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-800 bg-gray-950 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{profile.displayName}</div>
                        <div className="text-xs text-gray-500">{profile.directory}</div>
                      </div>
                      {active && <span className="text-[10px] uppercase tracking-wider text-cyan-300">Selected</span>}
                    </div>
                    <div className="text-[11px] text-gray-600 mt-1 break-all">{profile.path}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-h-[20px] text-sm">
              {message && <span className={message.startsWith('Saved') ? 'text-green-400' : 'text-red-400'}>{message}</span>}
            </div>
            <button
              onClick={save}
              disabled={saving || loading}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Automation Browser'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

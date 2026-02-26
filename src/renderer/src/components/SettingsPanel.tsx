import { useEffect, useMemo, useState } from 'react'

type LocalBrowserProfile = {
  id: string; directory: string; displayName: string; path: string
}
type LocalBrowserInstall = {
  id: string; name: string; executablePath: string; userDataDir: string; profiles: LocalBrowserProfile[]
}
type ScanResult = { platform: string; browsers: LocalBrowserInstall[] }
type AutomationBrowserSettings = {
  browserId?: string; browserName?: string; executablePath?: string
  userDataDir?: string; profileDirectory?: string; profilePath?: string; locale?: string
}

type SettingsTab = 'browser' | 'storage' | 'notifications'

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'browser', label: 'Browser & Automation', icon: '🌐' },
  { id: 'storage', label: 'Storage', icon: '📁' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
]

export function SettingsPanel() {
  const api = (window as any).api
  const [tab, setTab] = useState<SettingsTab>('browser')

  return (
    <div className="flex-1 flex bg-gray-900 h-full text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-gray-800/60 bg-gray-950/50 p-3 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-widest text-gray-600 px-3 pt-2 pb-2">Settings</p>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === t.id
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
            }`}
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {tab === 'browser' && <BrowserSection api={api} />}
          {tab === 'storage' && <StorageSection api={api} />}
          {tab === 'notifications' && <NotificationsSection />}
        </div>
      </div>
    </div>
  )
}

// ── Browser & Automation ────────────────────────────────────

function BrowserSection({ api }: { api: any }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scan, setScan] = useState<ScanResult>({ platform: 'unknown', browsers: [] })
  const [selectedBrowserId, setSelectedBrowserId] = useState('')
  const [selectedProfileDirectory, setSelectedProfileDirectory] = useState('')
  const [locale, setLocale] = useState('en-US')
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true); setMessage('')
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
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const selectedBrowser = useMemo(
    () => scan.browsers.find(b => b.id === selectedBrowserId) || null,
    [scan.browsers, selectedBrowserId]
  )
  const selectedProfile = useMemo(
    () => selectedBrowser?.profiles.find(p => p.directory === selectedProfileDirectory) || null,
    [selectedBrowser, selectedProfileDirectory]
  )

  const save = async () => {
    setSaving(true); setMessage('')
    try {
      await api.invoke('settings:set-automation-browser', {
        locale: locale.trim() || 'en-US',
        browserId: selectedBrowser?.id || '', browserName: selectedBrowser?.name || '',
        executablePath: selectedBrowser?.executablePath || '', userDataDir: selectedBrowser?.userDataDir || '',
        profileDirectory: selectedProfile?.directory || '', profilePath: selectedProfile?.path || '',
      })
      setMessage('Saved! Next automation run will use this browser.')
    } catch { setMessage('Failed to save settings.') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Browser & Automation</h2>
          <p className="text-sm text-gray-400 mt-1">
            Browser, profile, and locale for publish automation. Platform: <span className="font-mono text-cyan-400">{scan.platform}</span>
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-2 rounded-lg border border-gray-700 text-sm hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50">
          {loading ? 'Scanning...' : '⟳ Rescan'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-2">Locale</label>
          <input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US"
            className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
          <p className="text-xs text-gray-500 mt-2">Affects Playwright locale, Accept-Language, Chromium --lang.</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-2">Browser</label>
          <select value={selectedBrowserId} onChange={(e) => {
            setSelectedBrowserId(e.target.value)
            const next = scan.browsers.find(b => b.id === e.target.value)
            setSelectedProfileDirectory(next?.profiles?.[0]?.directory || '')
          }} className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500">
            {scan.browsers.length === 0 && <option value="">No supported browsers found</option>}
            {scan.browsers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {selectedBrowser && <p className="text-xs text-gray-500 mt-2 break-all">{selectedBrowser.executablePath}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Profiles</p>
          <span className="text-xs text-gray-500">{selectedBrowser?.profiles.length || 0} found</span>
        </div>
        {!selectedBrowser ? (
          <div className="text-sm text-gray-500 py-4">Select a browser first.</div>
        ) : selectedBrowser.profiles.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">No profiles for this browser.</div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {selectedBrowser.profiles.map(profile => {
              const active = profile.directory === selectedProfileDirectory
              return (
                <button key={profile.id} onClick={() => setSelectedProfileDirectory(profile.directory)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                    active ? 'border-cyan-500 bg-cyan-500/10' : 'border-gray-800 bg-gray-950 hover:border-gray-700'
                  }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{profile.displayName}</div>
                      <div className="text-[11px] text-gray-600 break-all mt-0.5">{profile.path}</div>
                    </div>
                    {active && <span className="text-[10px] uppercase tracking-wider text-cyan-300">Selected</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 flex items-center justify-between gap-4">
        <div className="min-h-[20px] text-sm">
          {message && <span className={message.startsWith('Saved') ? 'text-green-400' : 'text-red-400'}>{message}</span>}
        </div>
        <button onClick={save} disabled={saving || loading}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Browser Settings'}
        </button>
      </div>
    </div>
  )
}

// ── Storage ─────────────────────────────────────────────────

function StorageSection({ api }: { api: any }) {
  const [mediaPath, setMediaPath] = useState('')
  const [defaultPath, setDefaultPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.invoke('settings:get-media-path').then((data: any) => {
      setMediaPath(data.path || '')
      setDefaultPath(data.defaultPath || '')
    }).catch(console.error)
  }, [])

  const browse = async () => {
    const dir = await api.invoke('settings:browse-folder')
    if (dir) setMediaPath(dir)
  }

  const save = async () => {
    setSaving(true); setMessage('')
    try {
      await api.invoke('settings:set-media-path', { path: mediaPath })
      setMessage('Saved! New downloads will use this folder.')
    } catch { setMessage('Failed to save.') }
    finally { setSaving(false) }
  }

  const reset = () => setMediaPath(defaultPath)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Storage</h2>
        <p className="text-sm text-gray-400 mt-1">Choose where downloaded videos, thumbnails, and media files are stored.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
        <label className="block text-[11px] uppercase tracking-wider text-gray-500">Media Download Folder</label>
        <div className="flex gap-2">
          <input value={mediaPath} onChange={e => setMediaPath(e.target.value)}
            className="flex-1 rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500 font-mono text-xs" />
          <button onClick={browse}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm hover:border-cyan-400 hover:text-cyan-300 transition shrink-0">
            Browse...
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Default: <code className="text-gray-400">{defaultPath}</code></span>
          {mediaPath !== defaultPath && (
            <button onClick={reset} className="text-cyan-400 hover:text-cyan-300 transition">Reset to default</button>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-1">
          Subfolders: <code className="text-gray-400">videos/</code>, <code className="text-gray-400">thumbs/</code>
        </p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 flex items-center justify-between gap-4">
        <div className="min-h-[20px] text-sm">
          {message && <span className={message.startsWith('Saved') ? 'text-green-400' : 'text-red-400'}>{message}</span>}
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Storage Path'}
        </button>
      </div>
    </div>
  )
}

// ── Notifications ───────────────────────────────────────────

function NotificationsSection() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Notifications</h2>
        <p className="text-sm text-gray-400 mt-1">Configure how the app notifies you about events.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
        <p className="text-gray-500 text-sm">🔔 Toast notifications are enabled by default.</p>
        <p className="text-gray-600 text-xs mt-2">More notification settings coming soon — sound on/off, desktop notifications, etc.</p>
      </div>
    </div>
  )
}

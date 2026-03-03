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

type SentryProject = {
  id: string
  slug: string
  name?: string
  platform?: string
}

type SentryConnection = {
  connectedAt: number
  baseUrl: string
  orgSlug: string
  tokenScope?: string
  tokenExpiresAt?: number
  selectedProductionProjectSlug?: string
  selectedStagingProjectSlug?: string
  projects: SentryProject[]
}

type SentryPending = {
  sessionId: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  intervalSec: number
  expiresAt: number
  nextPollAt: number
}

type SentryStatus = {
  configured: boolean
  connected: boolean
  baseUrl: string
  clientIdHint: string
  pending?: SentryPending
  connection?: SentryConnection
}

type SettingsTab = 'browser' | 'storage' | 'notifications' | 'plugins'

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'browser', label: 'Browser & Automation', icon: 'B' },
  { id: 'storage', label: 'Storage', icon: 'S' },
  { id: 'notifications', label: 'Notifications', icon: 'N' },
  { id: 'plugins', label: 'Video Plugins', icon: '🧩' },
]

export function SettingsPanel() {
  const api = (globalThis as any).api
  const [tab, setTab] = useState<SettingsTab>('browser')

  return (
    <div className="flex-1 flex bg-vintage-white h-full text-vintage-charcoal overflow-hidden font-[Inter]">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-vintage-border bg-vintage-cream/30 p-4 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-vintage-gray px-4 pt-3 pb-2 opacity-70">Settings</p>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${tab === t.id
              ? 'bg-vintage-white text-vintage-charcoal border border-vintage-border shadow-sm shadow-vintage-border/20'
              : 'text-vintage-gray hover:text-vintage-charcoal hover:bg-vintage-border/30 border border-transparent'
              }`}
          >
            <span className={`text-lg px-2 py-1 rounded-lg ${tab === t.id ? 'bg-pastel-blue/30' : 'bg-transparent'}`}>{t.icon}</span>
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
          {tab === 'plugins' && <PluginsSection api={api} />}
        </div>
      </div>
    </div>
  )
}

//  Browser & Automation 

function BrowserSection({ api }: { api: any }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scan, setScan] = useState<ScanResult>({ platform: 'unknown', browsers: [] })
  const [selectedBrowserId, setSelectedBrowserId] = useState('')
  const [selectedProfileDirectory, setSelectedProfileDirectory] = useState('')
  const [locale, setLocale] = useState('en-US')
  const [message, setMessage] = useState('')
  const [sentryStatus, setSentryStatus] = useState<SentryStatus | null>(null)
  const [sentryBusy, setSentryBusy] = useState(false)
  const [sentryPolling, setSentryPolling] = useState(false)
  const [sentryMessage, setSentryMessage] = useState('')
  const [selectedProdSlug, setSelectedProdSlug] = useState('')
  const [selectedStageSlug, setSelectedStageSlug] = useState('')

  const defaultProd = (projects: SentryProject[]) =>
    projects.find(p => p.slug.toLowerCase() === 'bombo-repost')?.slug ||
    projects.find(p => !/staging/i.test(p.slug))?.slug ||
    projects[0]?.slug ||
    ''

  const defaultStage = (projects: SentryProject[]) =>
    projects.find(p => p.slug.toLowerCase() === 'boembo-repost-staging')?.slug ||
    projects.find(p => /staging/i.test(p.slug))?.slug ||
    projects[0]?.slug ||
    ''

  const applySentryStatus = (status: SentryStatus | null) => {
    setSentryStatus(status)
    const projects = status?.connection?.projects || []
    const nextProd = status?.connection?.selectedProductionProjectSlug || defaultProd(projects)
    const nextStage = status?.connection?.selectedStagingProjectSlug || defaultStage(projects)
    setSelectedProdSlug(nextProd)
    setSelectedStageSlug(nextStage)
  }

  const refreshSentryStatus = async () => {
    const status = await api.invoke('settings:sentry-oauth-status')
    applySentryStatus(status || null)
    return status as SentryStatus | null
  }

  const load = async () => {
    setLoading(true); setMessage('')
    try {
      const [scanData, current, sentry] = await Promise.all([
        api.invoke('browser:scan-local'),
        api.invoke('settings:get-automation-browser'),
        api.invoke('settings:sentry-oauth-status'),
      ])
      setScan(scanData || { platform: 'unknown', browsers: [] })
      const settings: AutomationBrowserSettings = current || {}
      setLocale(settings.locale || 'en-US')
      applySentryStatus((sentry as SentryStatus) || null)

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

  useEffect(() => {
    if (!sentryPolling) return
    const pending = sentryStatus?.pending
    if (!pending?.sessionId) return
    const intervalMs = Math.max(2000, (pending.intervalSec || 5) * 1000)
    const timer = (globalThis as any).setInterval(async () => {
      try {
        const polled = await api.invoke('settings:sentry-oauth-poll', { sessionId: pending.sessionId })
        if (polled?.status === 'pending') {
          setSentryStatus(prev => prev ? { ...prev, pending: polled.pending } : prev)
          return
        }
        setSentryPolling(false)
        if (polled?.status === 'connected') {
          setSentryMessage('Sentry connected. Org/projects loaded from account.')
          await refreshSentryStatus()
        } else {
          setSentryMessage(`Connect result: ${polled?.message || 'Unknown status'}`)
          await refreshSentryStatus()
        }
      } catch (err: any) {
        setSentryPolling(false)
        setSentryMessage(`Connect polling failed: ${err?.message || String(err)}`)
      }
    }, intervalMs)
    return () => (globalThis as any).clearInterval(timer)
  }, [api, sentryPolling, sentryStatus?.pending?.sessionId, sentryStatus?.pending?.intervalSec])

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

  const startSentryConnect = async () => {
    setSentryBusy(true)
    setSentryMessage('')
    try {
      const started = await api.invoke('settings:sentry-oauth-start')
      if (started?.status === 'pending') {
        setSentryMessage('Opened browser for Sentry authorization. Waiting for approval...')
        setSentryPolling(true)
      }
      await refreshSentryStatus()
    } catch (err: any) {
      setSentryPolling(false)
      setSentryMessage(`Connect Sentry failed: ${err?.message || String(err)}`)
    } finally {
      setSentryBusy(false)
    }
  }

  const pollSentryOnce = async () => {
    const pending = sentryStatus?.pending
    if (!pending?.sessionId) return
    setSentryBusy(true)
    try {
      const polled = await api.invoke('settings:sentry-oauth-poll', { sessionId: pending.sessionId })
      if (polled?.status === 'connected') {
        setSentryPolling(false)
        setSentryMessage('Sentry connected. Project list synced.')
      } else {
        setSentryMessage(polled?.message || 'Authorization still pending.')
      }
      await refreshSentryStatus()
    } catch (err: any) {
      setSentryMessage(`Check authorization failed: ${err?.message || String(err)}`)
    } finally {
      setSentryBusy(false)
    }
  }

  const disconnectSentry = async () => {
    setSentryBusy(true)
    setSentryPolling(false)
    setSentryMessage('')
    try {
      await api.invoke('settings:sentry-oauth-disconnect')
      setSentryMessage('Sentry disconnected.')
      await refreshSentryStatus()
    } catch (err: any) {
      setSentryMessage(`Disconnect failed: ${err?.message || String(err)}`)
    } finally {
      setSentryBusy(false)
    }
  }

  const saveSentryProjectSelection = async () => {
    setSentryBusy(true)
    setSentryMessage('')
    try {
      await api.invoke('settings:sentry-oauth-select-projects', {
        productionProjectSlug: selectedProdSlug,
        stagingProjectSlug: selectedStageSlug,
      })
      setSentryMessage('Sentry project mapping saved.')
      await refreshSentryStatus()
    } catch (err: any) {
      setSentryMessage(`Save mapping failed: ${err?.message || String(err)}`)
    } finally {
      setSentryBusy(false)
    }
  }

  const sentryConnection = sentryStatus?.connection
  const sentryProjects = sentryConnection?.projects || []
  const pending = sentryStatus?.pending

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-vintage-charcoal">Browser & Automation</h2>
          <p className="text-sm text-vintage-gray mt-1 flex items-center gap-2">
            Browser, profile, and locale for publish automation. Platform: <span className="font-mono text-xs bg-pastel-blue/30 px-2 py-0.5 rounded border border-pastel-blue/50 text-vintage-charcoal">{scan.platform}</span>
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 rounded-xl border border-vintage-border bg-vintage-cream text-sm font-medium hover:border-pastel-blue hover:bg-pastel-blue/10 transition-colors disabled:opacity-50 cursor-pointer">
          {loading ? 'Scanning...' : 'Rescan'}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-vintage-border bg-vintage-cream/40 p-5 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wider text-vintage-gray mb-3 opacity-80">Locale</label>
          <input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US"
            className="w-full rounded-xl bg-white border border-vintage-border px-4 py-2.5 text-sm outline-none focus:border-pastel-blue focus:ring-2 focus:ring-pastel-blue/30 transition-all font-mono" />
          <p className="text-xs text-vintage-gray mt-3 opacity-80">Affects Playwright locale, Accept-Language, Chromium --lang.</p>
        </div>
        <div className="rounded-2xl border border-vintage-border bg-vintage-cream/40 p-5 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wider text-vintage-gray mb-3 opacity-80">Browser</label>
          <select value={selectedBrowserId} onChange={(e) => {
            setSelectedBrowserId(e.target.value)
            const next = scan.browsers.find(b => b.id === e.target.value)
            setSelectedProfileDirectory(next?.profiles?.[0]?.directory || '')
          }} className="w-full rounded-xl bg-white border border-vintage-border px-4 py-2.5 text-sm outline-none focus:border-pastel-blue focus:ring-2 focus:ring-pastel-blue/30 transition-all">
            {scan.browsers.length === 0 && <option value="">No supported browsers found</option>}
            {scan.browsers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {selectedBrowser && <p className="text-xs text-vintage-gray mt-3 break-all font-mono opacity-80">{selectedBrowser.executablePath}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-vintage-border bg-vintage-cream/40 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-vintage-gray opacity-80">Profiles</p>
          <span className="text-xs font-medium text-vintage-charcoal bg-white border border-vintage-border px-2 py-1 rounded-md shadow-sm">{selectedBrowser?.profiles.length || 0} found</span>
        </div>
        {!selectedBrowser ? (
          <div className="text-sm text-vintage-gray py-6 text-center border-2 border-dashed border-vintage-border rounded-xl">Select a browser first.</div>
        ) : selectedBrowser.profiles.length === 0 ? (
          <div className="text-sm text-vintage-gray py-6 text-center border-2 border-dashed border-vintage-border rounded-xl">No profiles for this browser.</div>
        ) : (
          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2 scrollbar-thin">
            {selectedBrowser.profiles.map(profile => {
              const active = profile.directory === selectedProfileDirectory
              return (
                <button key={profile.id} onClick={() => setSelectedProfileDirectory(profile.directory)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all duration-200 cursor-pointer ${active ? 'border-pastel-blue bg-pastel-blue/20 shadow-sm' : 'border-vintage-border bg-white hover:border-pastel-blue/50 hover:bg-pastel-blue/5'
                    }`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-vintage-charcoal">{profile.displayName}</div>
                      <div className="text-[11px] text-vintage-gray break-all mt-1 opacity-80 font-mono">{profile.path}</div>
                    </div>
                    {active && <span className="text-[10px] uppercase font-bold tracking-widest text-[#5c7c99] bg-white px-2 py-1 rounded shadow-sm">Selected</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-vintage-border bg-vintage-cream/40 p-5 flex items-center justify-between gap-4 shadow-sm">
        <div className="min-h-[20px] text-sm font-medium">
          {message && <span className={message.startsWith('Saved') ? 'text-green-700 bg-green-100 px-3 py-1 rounded-md' : 'text-red-700 bg-red-100 px-3 py-1 rounded-md'}>{message}</span>}
        </div>
        <button onClick={save} disabled={saving || loading}
          className="px-6 py-2.5 rounded-full bg-pastel-blue hover:bg-[#c2dcf0] text-vintage-charcoal text-sm font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer active:scale-95">
          {saving ? 'Saving...' : 'Save Browser Settings'}
        </button>
      </div>

      <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-indigo-300">Sentry Connect</p>
            <p className="text-sm text-gray-300 mt-1">
              One-time OAuth connect. App will auto-load org/project/DSN for debug send.
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded border ${sentryStatus?.connected
            ? 'text-green-300 border-green-500/40 bg-green-500/10'
            : 'text-gray-300 border-gray-700 bg-gray-800/30'
            }`}>
            {sentryStatus?.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        {!sentryStatus?.configured && (
          <p className="text-amber-300 text-sm">
            Missing `SENTRY_OAUTH_CLIENT_ID`. Set it in runtime env before using Connect Sentry.
          </p>
        )}

        {!!sentryConnection && (
          <div className="text-xs text-gray-300 space-y-1">
            <p>org: <span className="font-mono text-cyan-300">{sentryConnection.orgSlug}</span></p>
            <p>tokenScope: <span className="font-mono text-gray-200">{sentryConnection.tokenScope || '-'}</span></p>
            <p>
              connectedAt:{' '}
              <span className="font-mono text-gray-200">
                {new Date(sentryConnection.connectedAt).toLocaleString('vi-VN')}
              </span>
            </p>
          </div>
        )}

        {!!pending && (
          <div className="rounded-lg border border-indigo-800/50 bg-black/20 p-3 space-y-2 text-sm text-gray-300">
            <p>
              Authorization pending. userCode:{' '}
              <span className="font-mono text-indigo-200">{pending.userCode}</span>
            </p>
            <p className="text-xs break-all">
              Verify URL: <span className="font-mono text-gray-200">{pending.verificationUriComplete || pending.verificationUri}</span>
            </p>
            <p className="text-xs">
              expiresAt: {new Date(pending.expiresAt).toLocaleString('vi-VN')}
            </p>
          </div>
        )}

        {sentryProjects.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="sentry-prod-select" className="block text-[11px] uppercase tracking-wider text-gray-500 mb-2">Production Project</label>
              <select
                id="sentry-prod-select"
                value={selectedProdSlug}
                onChange={(e) => setSelectedProdSlug(e.target.value)}
                className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500"
              >
                {sentryProjects.map(p => (
                  <option key={`prod-${p.id}`} value={p.slug}>{p.slug}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sentry-stage-select" className="block text-[11px] uppercase tracking-wider text-gray-500 mb-2">Staging Project</label>
              <select
                id="sentry-stage-select"
                value={selectedStageSlug}
                onChange={(e) => setSelectedStageSlug(e.target.value)}
                className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm outline-none focus:border-cyan-500"
              >
                {sentryProjects.map(p => (
                  <option key={`stage-${p.id}`} value={p.slug}>{p.slug}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={startSentryConnect}
            disabled={!sentryStatus?.configured || sentryBusy}
            className="px-3 py-2 rounded-lg border border-indigo-500/40 text-indigo-200 text-sm hover:bg-indigo-500/10 transition disabled:opacity-50"
          >
            {sentryBusy ? 'Working...' : 'Connect Sentry'}
          </button>
          {!!pending && (
            <button
              onClick={pollSentryOnce}
              disabled={sentryBusy}
              className="px-3 py-2 rounded-lg border border-cyan-500/40 text-cyan-200 text-sm hover:bg-cyan-500/10 transition disabled:opacity-50"
            >
              Check Authorization
            </button>
          )}
          {sentryPolling && (
            <button
              onClick={() => setSentryPolling(false)}
              className="px-3 py-2 rounded-lg border border-gray-600 text-gray-200 text-sm hover:bg-gray-700/20 transition"
            >
              Stop Auto Poll
            </button>
          )}
          {!!sentryConnection && (
            <button
              onClick={disconnectSentry}
              disabled={sentryBusy}
              className="px-3 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10 transition disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
          <button
            onClick={async () => { await refreshSentryStatus() }}
            disabled={sentryBusy}
            className="px-3 py-2 rounded-lg border border-gray-600 text-gray-200 text-sm hover:bg-gray-700/20 transition disabled:opacity-50"
          >
            Refresh Status
          </button>
          {sentryProjects.length > 0 && (
            <button
              onClick={saveSentryProjectSelection}
              disabled={sentryBusy}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition disabled:opacity-50"
            >
              Save Project Mapping
            </button>
          )}
        </div>

        {sentryMessage && (
          <p className={`text-sm ${sentryMessage.toLowerCase().includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
            {sentryMessage}
          </p>
        )}
      </div>
    </div>
  )
}

//  Storage 

function StorageSection({ api }: { api: any }) {
  const [mediaPath, setMediaPath] = useState('')
  const [defaultPath, setDefaultPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [dbPath, setDbPath] = useState('')
  const [cleaningSchema, setCleaningSchema] = useState(false)
  const [checkingSchema, setCheckingSchema] = useState(false)
  const [schemaMessage, setSchemaMessage] = useState('')
  const [schemaReport, setSchemaReport] = useState<any | null>(null)

  useEffect(() => {
    api.invoke('settings:get-media-path').then((data: any) => {
      setMediaPath(data.path || '')
      setDefaultPath(data.defaultPath || '')
    }).catch(console.error)
    api.invoke('settings:db-info').then((data: any) => {
      setDbPath(data?.dbPath || '')
    }).catch(() => setDbPath(''))
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

  const cleanSchema = async () => {
    const ok = window.confirm(
      'Clean DB schema will delete all campaigns/jobs/logs/settings and recreate the schema. Continue?'
    )
    if (!ok) return

    setCleaningSchema(true)
    setSchemaMessage('')
    try {
      await api.invoke('settings:clean-schema')
      setSchemaMessage('Schema cleaned. Database has been recreated.')
      const media = await api.invoke('settings:get-media-path')
      setMediaPath(media?.path || '')
      setDefaultPath(media?.defaultPath || '')
      const report = await api.invoke('settings:inspect-schema')
      setSchemaReport(report)
    } catch (err: any) {
      setSchemaMessage(`Clean schema failed: ${err?.message || String(err)}`)
    } finally {
      setCleaningSchema(false)
    }
  }

  const checkSchema = async () => {
    setCheckingSchema(true)
    setSchemaMessage('')
    try {
      const report = await api.invoke('settings:inspect-schema')
      setSchemaReport(report)
      const missingTableCount = Array.isArray(report?.missingTables) ? report.missingTables.length : 0
      const missingIndexCount = Array.isArray(report?.missingIndexes) ? report.missingIndexes.length : 0
      if (report?.healthy) {
        setSchemaMessage(`Schema OK. tables=${report.tables?.length || 0}, indexes=${report.indexes?.length || 0}`)
      } else {
        setSchemaMessage(`Schema drift detected: missingTables=${missingTableCount}, missingIndexes=${missingIndexCount}`)
      }
    } catch (err: any) {
      setSchemaMessage(`Check schema failed: ${err?.message || String(err)}`)
    } finally {
      setCheckingSchema(false)
    }
  }

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

      <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-red-300">Danger Zone</p>
          <p className="text-sm text-gray-300 mt-1">
            Clean DB schema: drop all tables and recreate schema from scratch.
          </p>
          {dbPath && (
            <p className="text-[11px] text-gray-500 mt-1 break-all">
              DB: <span className="font-mono">{dbPath}</span>
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            This will remove campaigns, jobs, logs, publish history, and app settings.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={checkSchema}
              disabled={checkingSchema}
              className="px-3 py-2 rounded-lg border border-amber-500/40 text-amber-300 text-sm hover:bg-amber-500/10 transition disabled:opacity-50"
            >
              {checkingSchema ? 'Checking...' : 'Check Schema'}
            </button>
            <button
              onClick={cleanSchema}
              disabled={cleaningSchema}
              className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10 transition disabled:opacity-50"
            >
              {cleaningSchema ? 'Cleaning...' : 'Clean Schema'}
            </button>
          </div>
        </div>
        {schemaMessage && (
          <p className={`text-sm ${(schemaMessage.startsWith('Schema cleaned') || schemaMessage.startsWith('Schema OK')) ? 'text-green-400' : 'text-red-400'}`}>
            {schemaMessage}
          </p>
        )}
        {schemaReport && (
          <div className="rounded-lg border border-gray-800 bg-black/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                checkedAt: {schemaReport.checkedAt ? new Date(schemaReport.checkedAt).toLocaleString('vi-VN') : '-'}
              </p>
              <button
                onClick={() => navigator.clipboard?.writeText(JSON.stringify(schemaReport, null, 2)).catch(() => { })}
                className="px-2 py-1 rounded border border-gray-700 text-[10px] text-gray-200 hover:border-gray-500"
              >
                Copy Schema Report
              </button>
            </div>
            <div className="text-xs text-gray-300">
              {schemaReport.healthy ? (
                <span className="text-green-400">Schema health: OK</span>
              ) : (
                <span className="text-red-400">
                  Schema health: DRIFT (missing tables/indexes)
                </span>
              )}
            </div>
            <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
              {JSON.stringify({
                dbPath: schemaReport.dbPath,
                missingTables: schemaReport.missingTables,
                missingIndexes: schemaReport.missingIndexes,
                tableStats: schemaReport.tableStats,
              }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

//  Notifications 

function NotificationsSection() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Notifications</h2>
        <p className="text-sm text-gray-400 mt-1">Configure how the app notifies you about events.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
        <p className="text-gray-500 text-sm">Toast notifications are enabled by default.</p>
        <p className="text-gray-600 text-xs mt-2">More notification settings coming soon  - sound on/off, desktop notifications, etc.</p>
      </div>
    </div>
  )
}

// ── Plugins Section ──────────────────────────────────

type PluginMeta = {
  id: string; name: string; group: string; icon: string
  description: string; previewHint: string
  defaultEnabled?: boolean; recommended?: boolean
}

const PLUGIN_GROUPS: { id: string; emoji: string; label: string }[] = [
  { id: 'anti-detect', emoji: '🛡️', label: 'Anti-Detect' },
  { id: 'transform', emoji: '🔧', label: 'Transform' },
  { id: 'overlay', emoji: '🖼️', label: 'Overlay' },
  { id: 'filter', emoji: '🎨', label: 'Filter' },
  { id: 'audio', emoji: '🔊', label: 'Audio' },
]

function PluginsSection({ api }: { api: any }) {
  const [plugins, setPlugins] = useState<PluginMeta[]>([])
  const [enabledIds, setEnabledIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.invoke('video-edit:get-plugin-metas'),
      api.invoke('settings:get-enabled-plugins'),
    ]).then(([metas, ids]: [PluginMeta[], string[]]) => {
      setPlugins(metas || [])
      // If no plugins saved yet, auto-enable recommended
      if (!ids || ids.length === 0) {
        const recommended = (metas || []).filter((p: PluginMeta) => p.defaultEnabled || p.recommended).map((p: PluginMeta) => p.id)
        setEnabledIds(recommended)
        api.invoke('settings:set-enabled-plugins', recommended)
      } else {
        setEnabledIds(ids)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [api])

  const toggle = (id: string) => {
    const next = enabledIds.includes(id) ? enabledIds.filter(x => x !== id) : [...enabledIds, id]
    setEnabledIds(next)
    api.invoke('settings:set-enabled-plugins', next)
  }

  const enableAll = () => {
    const all = plugins.map(p => p.id)
    setEnabledIds(all)
    api.invoke('settings:set-enabled-plugins', all)
  }

  const disableAll = () => {
    setEnabledIds([])
    api.invoke('settings:set-enabled-plugins', [])
  }

  if (loading) return <p className="text-sm text-vintage-gray animate-pulse">Loading plugins...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-vintage-charcoal">Video Edit Plugins</h2>
          <p className="text-xs text-vintage-gray mt-1">
            Enable/disable plugins for the video editor. Only enabled plugins will be available in the editor.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={enableAll}
            className="px-3 py-1.5 text-[10px] font-bold rounded-lg cursor-pointer transition bg-pastel-mint/50 text-green-700 hover:bg-pastel-mint">
            Enable All
          </button>
          <button onClick={disableAll}
            className="px-3 py-1.5 text-[10px] font-bold rounded-lg cursor-pointer transition bg-pastel-pink/50 text-red-700 hover:bg-pastel-pink">
            Disable All
          </button>
        </div>
      </div>

      <p className="text-xs text-vintage-gray mb-4">
        {enabledIds.length} of {plugins.length} plugins enabled
      </p>

      {PLUGIN_GROUPS.map(group => {
        const gp = plugins.filter(p => p.group === group.id)
        if (gp.length === 0) return null
        return (
          <div key={group.id} className="mb-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-vintage-gray mb-2 flex items-center gap-2">
              <span>{group.emoji}</span> {group.label}
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-vintage-cream">
                {gp.filter(p => enabledIds.includes(p.id)).length}/{gp.length}
              </span>
            </h3>
            <div className="flex flex-col gap-1.5">
              {gp.map(plugin => {
                const enabled = enabledIds.includes(plugin.id)
                return (
                  <div key={plugin.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer"
                    style={{
                      background: enabled ? 'white' : 'transparent',
                      border: `1px solid ${enabled ? 'var(--ev-c-gray-3)' : 'transparent'}`,
                      opacity: enabled ? 1 : 0.5,
                    }}
                    onClick={() => toggle(plugin.id)}>
                    <span className="text-lg">{plugin.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-vintage-charcoal">{plugin.name}</p>
                      <p className="text-[10px] text-vintage-gray truncate">{plugin.description}</p>
                    </div>
                    {plugin.recommended && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-pastel-mint text-green-700 shrink-0">
                        REC
                      </span>
                    )}
                    <button
                      className="relative w-10 h-5 rounded-full transition-all duration-200 shrink-0 cursor-pointer"
                      style={{ background: enabled ? '#7c3aed' : '#e8e4db' }}
                      onClick={e => { e.stopPropagation(); toggle(plugin.id) }}>
                      <div className="absolute top-[2px] w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200"
                        style={{ left: enabled ? 22 : 2 }} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}



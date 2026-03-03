import { useState, useEffect, useCallback } from 'react'
import bomboLogo from '../assets/bombo_logo.png'

interface CheckResult {
    name: string
    label: string
    icon: string
    status: 'pending' | 'checking' | 'ok' | 'warning' | 'error'
    message?: string
    detail?: string
}

interface SplashScreenProps {
    onReady: () => void
}

export function SplashScreen({ onReady }: SplashScreenProps) {
    const [checks, setChecks] = useState<CheckResult[]>([
        { name: 'db', label: 'Database Connection', icon: '🗄️', status: 'pending' },
        { name: 'schema', label: 'Database Integrity', icon: '🔍', status: 'pending' },
        { name: 'storage', label: 'Storage Space', icon: '💾', status: 'pending' },
    ])
    const [serviceChecks, setServiceChecks] = useState<CheckResult[]>([])
    const [phase, setPhase] = useState<'branding' | 'checking' | 'done' | 'blocked'>('branding')
    const [storageInfo, setStorageInfo] = useState<{ freeMB: number; path: string } | null>(null)
    const [fadeOut, setFadeOut] = useState(false)

    const api = (window as any).api

    const updateCheck = useCallback((name: string, update: Partial<CheckResult>) => {
        setChecks(prev => prev.map(c => c.name === name ? { ...c, ...update } : c))
    }, [])

    const runChecks = useCallback(async () => {
        setPhase('checking')
        let allPassed = true

        // 1. Database connection
        updateCheck('db', { status: 'checking', message: 'Connecting to database...' })
        try {
            const dbInfo = await api.invoke('settings:db-info')
            if (dbInfo?.dbPath) {
                updateCheck('db', { status: 'ok', message: `Connected`, detail: dbInfo.dbPath })
            } else {
                updateCheck('db', { status: 'error', message: 'Database path not found' })
                allPassed = false
            }
        } catch (err: any) {
            updateCheck('db', { status: 'error', message: 'Database connection failed', detail: err?.message })
            allPassed = false
        }

        // 2. Database integrity
        updateCheck('schema', { status: 'checking', message: 'Verifying schema integrity...' })
        try {
            const schema = await api.invoke('settings:inspect-schema')
            if (schema?.healthy) {
                const tableCount = schema.tables?.length || 0
                updateCheck('schema', { status: 'ok', message: `${tableCount} tables, all indexes intact` })
            } else {
                const missing = [
                    ...(schema?.missingTables || []).map((t: string) => `table: ${t}`),
                    ...(schema?.missingIndexes || []).map((i: string) => `index: ${i}`),
                ]
                updateCheck('schema', {
                    status: 'error',
                    message: `Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` +${missing.length - 3} more` : ''}`,
                    detail: missing.join('\n'),
                })
                allPassed = false
            }
        } catch (err: any) {
            updateCheck('schema', { status: 'error', message: 'Schema check failed', detail: err?.message })
            allPassed = false
        }

        // 3. Storage
        updateCheck('storage', { status: 'checking', message: 'Checking disk space...' })
        try {
            const storage = await api.invoke('healthcheck:storage')
            setStorageInfo({ freeMB: storage.freeMB, path: storage.path })

            if (storage.ok) {
                updateCheck('storage', {
                    status: 'ok',
                    message: `${storage.freeMB >= 1024 ? `${(storage.freeMB / 1024).toFixed(1)} GB` : `${storage.freeMB} MB`} free`,
                    detail: storage.path,
                })
            } else if (storage.freeMB >= 0) {
                updateCheck('storage', {
                    status: 'warning',
                    message: `Only ${storage.freeMB} MB free — minimum 100 MB required`,
                    detail: storage.path,
                })
                allPassed = false
            } else {
                updateCheck('storage', {
                    status: 'error',
                    message: 'Could not determine free space',
                    detail: storage.error || storage.path,
                })
                allPassed = false
            }
        } catch (err: any) {
            updateCheck('storage', { status: 'error', message: 'Storage check failed', detail: err?.message })
            allPassed = false
        }

        // 4. Workflow service checks (dynamic — from flow.yaml health_checks)
        try {
            const svcResult = await api.invoke('healthcheck:services')
            const services = svcResult?.services || []

            if (services.length > 0) {
                const svcChecks: CheckResult[] = services.map((s: any) => ({
                    name: `svc_${s.name}`,
                    label: s.name,
                    icon: '🌐',
                    status: s.ok ? 'ok' : 'error',
                    message: s.ok
                        ? `Reachable (${s.ms}ms) — ${s.workflows.join(', ')}`
                        : `Unreachable — required by ${s.workflows.join(', ')}`,
                    detail: s.error || s.url,
                } as CheckResult))

                setServiceChecks(svcChecks)

                // Service failures are warnings (non-blocking) — user may have no active campaigns
                // But we flag them visually
                const anyFailed = svcChecks.some(c => c.status === 'error')
                if (anyFailed) {
                    // Service checks are warnings, not blockers
                    // allPassed stays the same — only core checks block
                }
            }
        } catch (err: any) {
            // Service check failure is not blocking
            setServiceChecks([{
                name: 'svc_error',
                label: 'Service Check',
                icon: '🌐',
                status: 'warning',
                message: `Could not check workflow services: ${err?.message}`,
            }])
        }

        if (allPassed) {
            setPhase('done')
            setTimeout(() => {
                setFadeOut(true)
                setTimeout(onReady, 500)
            }, 600)
        } else {
            setPhase('blocked')
        }
    }, [api, updateCheck, onReady])

    // Start branding → then run checks
    useEffect(() => {
        const timer = setTimeout(() => runChecks(), 800)
        return () => clearTimeout(timer)
    }, [runChecks])

    const handleOpenFolder = async () => {
        if (storageInfo?.path) {
            try { await api.invoke('shell:open-path', { path: storageInfo.path }) } catch { }
        }
    }

    const handleRefresh = () => {
        setChecks(prev => prev.map(c => ({ ...c, status: 'pending' as const, message: undefined, detail: undefined })))
        setServiceChecks([])
        setPhase('branding')
        setStorageInfo(null)
        setTimeout(() => runChecks(), 300)
    }

    const allChecks = [...checks, ...serviceChecks]
    const passedCount = allChecks.filter(c => c.status === 'ok').length
    const progressPct = allChecks.length > 0 ? (passedCount / allChecks.length) * 100 : 0

    return (
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 transition-opacity duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">

                {/* Branding Header */}
                <div className="px-8 pt-8 pb-4 flex flex-col items-center">
                    <img src={bomboLogo} alt="Bombo Repost" className="w-20 h-20 mb-3" style={{ imageRendering: 'auto' }} />
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Bombo Repost</h1>
                    <p className="text-xs text-slate-400 mt-1">Multi-platform video automation</p>
                </div>

                {/* Progress Bar */}
                <div className="px-8">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${phase === 'blocked' ? 'bg-red-400' : 'bg-gradient-to-r from-purple-500 to-emerald-500'}`}
                            style={{ width: `${phase === 'branding' ? 5 : progressPct}%` }}
                        />
                    </div>
                </div>

                {/* Core Check List */}
                <div className="px-8 py-4 space-y-2">
                    {checks.map(check => (
                        <CheckRow key={check.name} check={check} />
                    ))}
                </div>

                {/* Workflow Service Checks */}
                {serviceChecks.length > 0 && (
                    <div className="px-8 pb-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Workflow Services</p>
                        <div className="space-y-2">
                            {serviceChecks.map(check => (
                                <CheckRow key={check.name} check={check} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer: blocked */}
                {phase === 'blocked' && (
                    <div className="px-8 pb-6 pt-1">
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
                            <p className="text-xs text-red-600 font-medium">
                                ⛔ Cannot start — please resolve the issues above.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {storageInfo && storageInfo.freeMB < 100 && storageInfo.freeMB >= 0 && (
                                <button onClick={handleOpenFolder}
                                    className="flex-1 px-4 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition cursor-pointer">
                                    📂 Open Media Folder
                                </button>
                            )}
                            <button onClick={handleRefresh}
                                className="flex-1 px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition cursor-pointer shadow-sm">
                                🔄 Retry Checks
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer: success */}
                {phase === 'done' && (
                    <div className="px-8 pb-6 pt-1">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                            <p className="text-xs text-emerald-600 font-bold">✅ All checks passed — launching app...</p>
                        </div>
                    </div>
                )}

                <div className="px-8 pb-4 text-center">
                    <p className="text-[10px] text-slate-300">v1.0 · Health Check</p>
                </div>
            </div>
        </div>
    )
}

/** Reusable check row component */
function CheckRow({ check }: { check: CheckResult }) {
    return (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 ${check.status === 'ok' ? 'bg-emerald-50 border border-emerald-100' :
                check.status === 'error' ? 'bg-red-50 border border-red-100' :
                    check.status === 'warning' ? 'bg-amber-50 border border-amber-100' :
                        check.status === 'checking' ? 'bg-blue-50 border border-blue-100' :
                            'bg-slate-50 border border-slate-100'
            }`}>
            <span className={`text-lg ${check.status === 'checking' ? 'animate-spin' : ''}`}>
                {check.status === 'pending' ? '○' :
                    check.status === 'checking' ? '⏳' :
                        check.status === 'ok' ? '✅' :
                            check.status === 'warning' ? '⚠️' : '❌'}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs">{check.icon}</span>
                    <span className="text-sm font-semibold text-slate-700">{check.label}</span>
                </div>
                {check.message && (
                    <p className={`text-[11px] mt-0.5 truncate ${check.status === 'ok' ? 'text-emerald-600' :
                            check.status === 'error' ? 'text-red-500' :
                                check.status === 'warning' ? 'text-amber-600' :
                                    'text-slate-400'
                        }`} title={check.detail || check.message}>{check.message}</p>
                )}
            </div>
        </div>
    )
}

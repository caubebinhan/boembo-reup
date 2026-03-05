import { useEffect, useState, useCallback } from 'react'

interface Account {
    id: string
    username: string
    handle: string
    status: 'active' | 'expired'
    avatar?: string
}

interface WizardTargetProps {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

export function WizardTarget({ data, updateData }: WizardTargetProps) {
    const [accounts, setAccounts] = useState<Account[]>([])
    const [addingAccount, setAddingAccount] = useState(false)
    const publishAccountIds: string[] = data.publishAccountIds || []

    const fetchAccounts = useCallback(async () => {
        try {
            // @ts-ignore
            const list = await window.api.invoke('account:list')
            console.log('[WizardTarget] Fetched accounts:', list?.length || 0)
            setAccounts(list || [])
        } catch (err) {
            console.error('[WizardTarget] Failed to fetch accounts:', err)
            setAccounts([])
        }
    }, [])

    useEffect(() => {
        fetchAccounts()
        // @ts-ignore
        const off = window.api?.on('account:updated', () => {
            console.log('[WizardTarget] Account updated event — refreshing list')
            fetchAccounts()
        })
        return () => { if (typeof off === 'function') off() }
    }, [fetchAccounts])

    const toggleAccount = (id: string) => {
        if (publishAccountIds.includes(id)) {
            updateData({ publishAccountIds: publishAccountIds.filter(a => a !== id) })
        } else {
            updateData({ publishAccountIds: [...publishAccountIds, id] })
        }
    }

    const handleAddAccount = async () => {
        setAddingAccount(true)
        try {
            // @ts-ignore
            const result = await window.api.invoke('account:add')
            console.log('[WizardTarget] account:add result:', result)
            await fetchAccounts()
        } catch (err) {
            console.error('[WizardTarget] Failed to add account:', err)
        } finally {
            setAddingAccount(false)
        }
    }

    return (
        <div className="flex flex-col gap-6 text-slate-800 max-w-4xl mx-auto pb-10">

            {/* SECTION 1: Summary Bar */}
            <div className="grid grid-cols-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 gap-4">
                <div className="flex flex-col border-r border-purple-200">
                    <span className="text-xs text-purple-500 font-bold tracking-wider">CAMPAIGN NAME</span>
                    <span className="font-semibold text-lg truncate pr-4 text-slate-800">{data.name || 'Untitled Campaign'}</span>
                </div>
                <div className="flex flex-col border-r border-purple-200">
                    <span className="text-xs text-purple-500 font-bold tracking-wider">SCHEDULE</span>
                    <span className="font-medium text-sky-600">
                        📅 Recurring (Every {data.publishIntervalMinutes || 60}m)
                    </span>
                </div>
                <div className="flex flex-col pl-2">
                    <span className="text-xs text-purple-500 font-bold tracking-wider">VIDEOS</span>
                    <span className="font-medium text-slate-700">
                        {data.sources?.length || 0} Sources Selected
                    </span>
                </div>
            </div>

            {/* SECTION 2: Account Picker */}
            <div className="flex flex-col gap-4 mt-2">
                <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-bold text-slate-800">Select Target Accounts</h2>
                        <p className="text-slate-400 text-sm">Select one or more TikTok accounts to publish to.</p>
                    </div>
                    <button
                        onClick={handleAddAccount}
                        disabled={addingAccount}
                        className="text-sm font-medium border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl transition disabled:opacity-50 cursor-pointer text-slate-600"
                    >
                        {addingAccount ? '⏳ Logging in...' : '+ Add New Account'}
                    </button>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                    {accounts.map((acc, i) => {
                        const isSelected = publishAccountIds.includes(acc.id)

                        return (
                            <div
                                key={acc.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleAccount(acc.id)}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleAccount(acc.id)}
                                className={`flex items-center p-4 rounded-2xl border-2 transition cursor-pointer select-none group hover:shadow-md animate-slide-up ${isSelected
                                    ? 'border-purple-400 bg-purple-50/50 shadow-sm'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                style={{ animationDelay: `${i * 50}ms` }}
                            >
                                {/* Checkbox */}
                                <div className="px-2 border-r border-slate-200 mr-4 pr-6">
                                    <div className={`w-5 h-5 rounded-md border-2 ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-slate-300'} flex items-center justify-center transition`}>
                                        {isSelected && <span className="text-white text-xs font-bold animate-scale-check">✓</span>}
                                    </div>
                                </div>

                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-400 to-indigo-500 flex items-center justify-center text-lg font-bold mr-4 text-white shadow-md overflow-hidden">
                                    {acc.avatar ? <img src={acc.avatar} className="w-full h-full rounded-full" /> : acc.username.charAt(0)}
                                </div>

                                {/* Details */}
                                <div className="flex-1 flex flex-col">
                                    <span className="font-bold text-lg text-slate-800">{acc.username}</span>
                                    <span className="text-sm text-slate-400">{acc.handle}</span>
                                </div>

                                {/* Status Badge */}
                                <div className="flex items-center gap-4">
                                    {acc.status === 'active' ? (
                                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold tracking-wider">ACTIVE</span>
                                    ) : (
                                        <span className="bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded-full text-xs font-bold tracking-wider">EXPIRED</span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Info Text */}
                <div className="flex justify-end mt-2">
                    {publishAccountIds.length > 0 ? (
                        <span className="text-emerald-600 font-medium">✅ {publishAccountIds.length} account{publishAccountIds.length > 1 ? 's' : ''} selected</span>
                    ) : (
                        <span className="text-red-500 font-medium">Please select at least 1 account</span>
                    )}
                </div>
            </div>

        </div>
    )
}

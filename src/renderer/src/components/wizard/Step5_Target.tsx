import { useEffect, useState } from 'react'

interface Account {
    id: string
    username: string
    handle: string
    status: 'active' | 'expired'
    avatar?: string
}

interface Step5Props {
    data: Record<string, any>
    updateData: (updates: Record<string, any>) => void
}

export function Step5_Target({ data, updateData }: Step5Props) {
    const [accounts, setAccounts] = useState<Account[]>([])
    const selectedAccounts: string[] = data.selectedAccounts || []

    useEffect(() => {
        // Fetch accounts from IPC
        // @ts-ignore
        window.api.invoke('account:list').then(data => {
            if (data && data.length > 0) {
                setAccounts(data)
            } else {
                // Fallback mock accounts if empty
                setAccounts([
                    { id: 'acc1', username: 'Animation Lab', handle: '@animationlabjapan', status: 'active' },
                    { id: 'acc2', username: 'Daily News', handle: '@dailynews123', status: 'expired' }
                ])
            }
        }).catch(() => {
            setAccounts([
                { id: 'acc1', username: 'Animation Lab', handle: '@animationlabjapan', status: 'active' },
                { id: 'acc2', username: 'Daily News', handle: '@dailynews123', status: 'expired' }
            ])
        })
    }, [])

    const toggleAccount = (id: string) => {
        if (selectedAccounts.includes(id)) {
            updateData({ selectedAccounts: selectedAccounts.filter(a => a !== id) })
        } else {
            updateData({ selectedAccounts: [...selectedAccounts, id] })
        }
    }

    const handleAddAccount = async () => {
        // @ts-ignore
        await window.api.invoke('account:add')
        // Should trigger reload of account:list, omitting for now
    }

    return (
        <div className="flex flex-col gap-6 text-white max-w-4xl mx-auto pb-10">

            {/* SECTION 1: Summary Bar */}
            <div className="grid grid-cols-3 bg-purple-900/30 border border-purple-500/30 rounded-xl p-5 gap-4">
                <div className="flex flex-col border-r border-purple-500/30">
                    <span className="text-xs text-purple-300 font-bold tracking-wider">CAMPAIGN NAME</span>
                    <span className="font-semibold text-lg truncate pr-4">{data.name || 'Untitled Campaign'}</span>
                </div>
                <div className="flex flex-col border-r border-purple-500/30">
                    <span className="text-xs text-purple-300 font-bold tracking-wider">SCHEDULE</span>
                    <span className="font-medium text-cyan-400">
                        📅 Recurring (Every {data.intervalMinutes || 60}m)
                    </span>
                </div>
                <div className="flex flex-col pl-2">
                    <span className="text-xs text-purple-300 font-bold tracking-wider">VIDEOS</span>
                    <span className="font-medium text-white">
                        {data.sources?.length || 0} Sources Selected
                    </span>
                </div>
            </div>

            {/* SECTION 2: Account Picker */}
            <div className="flex flex-col gap-4 mt-2">
                <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-bold">Select Target Accounts</h2>
                        <p className="text-gray-400 text-sm">Select one or more TikTok accounts to publish to.</p>
                    </div>
                    <button
                        onClick={handleAddAccount}
                        className="text-sm font-medium border border-gray-600 hover:bg-gray-800 px-4 py-2 rounded-lg transition"
                    >
                        + Add New Account
                    </button>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                    {accounts.map(acc => {
                        const isSelected = selectedAccounts.includes(acc.id)

                        return (
                            <div
                                key={acc.id}
                                onClick={() => toggleAccount(acc.id)}
                                className={`flex items-center p-4 rounded-xl border-2 transition cursor-pointer select-none group ${isSelected
                                        ? 'border-purple-600 bg-purple-600/10'
                                        : 'border-gray-700 bg-[#111827] hover:border-gray-500'
                                    }`}
                            >
                                {/* Checkbox */}
                                <div className="px-2 border-r border-gray-700/50 mr-4 pr-6">
                                    <div className={`w-5 h-5 rounded border ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-500'} flex items-center justify-center`}>
                                        {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                                    </div>
                                </div>

                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-lg font-bold mr-4">
                                    {acc.avatar ? <img src={acc.avatar} className="w-full h-full rounded-full" /> : acc.username.charAt(0)}
                                </div>

                                {/* Details */}
                                <div className="flex-1 flex flex-col">
                                    <span className="font-bold text-lg">{acc.username}</span>
                                    <span className="text-sm text-gray-400">{acc.handle}</span>
                                </div>

                                {/* Status Badge */}
                                <div className="flex items-center gap-4">
                                    {acc.status === 'active' ? (
                                        <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wider">ACTIVE</span>
                                    ) : (
                                        <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wider">EXPIRED</span>
                                    )}

                                    <button
                                        onClick={(e) => { e.stopPropagation(); alert('Settings') }}
                                        className="text-xl text-gray-500 hover:text-white transition p-2"
                                        title="Account Settings"
                                    >
                                        ⚙️
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Info Text */}
                <div className="flex justify-end mt-2">
                    {selectedAccounts.length > 0 ? (
                        <span className="text-green-400 font-medium">✅ {selectedAccounts.length} account{selectedAccounts.length > 1 ? 's' : ''} selected</span>
                    ) : (
                        <span className="text-red-400 font-medium">Please select at least 1 account</span>
                    )}
                </div>
            </div>

        </div>
    )
}

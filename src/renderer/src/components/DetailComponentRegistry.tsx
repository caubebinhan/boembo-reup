import React, { useEffect, useState } from 'react'

export interface DetailSectionProps {
    campaignId: string
    campaign: any
    workflowId: string
}

// ── Built-in: Execution Log Viewer ─────────────────

function ExecutionLogView({ campaignId }: DetailSectionProps) {
    const [logs, setLogs] = useState<any[]>([])
    const [filter, setFilter] = useState<string>('all')

    const fetchLogs = async () => {
        try {
            // @ts-ignore
            const data = await window.api.invoke('campaign:get-logs', { id: campaignId, limit: 300 })
            setLogs(data || [])
        } catch (err) {
            console.error('Failed to fetch logs:', err)
        }
    }

    useEffect(() => {
        fetchLogs()
        const timer = setInterval(fetchLogs, 3000)

        // Also listen for live log events
        // @ts-ignore
        const off = window.api.on('execution:log', (entry: any) => {
            if (entry.campaign_id === campaignId) {
                setLogs(prev => [{ ...entry, id: Date.now() }, ...prev].slice(0, 300))
            }
        })

        return () => {
            clearInterval(timer)
            if (typeof off === 'function') off()
        }
    }, [campaignId])

    const filteredLogs = filter === 'all'
        ? logs
        : logs.filter(l => l.level === filter || l.event?.includes(filter))

    const levelColors: Record<string, string> = {
        info: 'text-blue-400',
        warn: 'text-yellow-400',
        error: 'text-red-400',
        debug: 'text-gray-500',
        progress: 'text-cyan-400'
    }

    return (
        <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex items-center gap-2">
                {['all', 'info', 'progress', 'error', 'warn'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1 text-xs rounded-full transition ${filter === f
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        {f.toUpperCase()}
                    </button>
                ))}
                <span className="text-xs text-gray-600 ml-auto">{filteredLogs.length} entries</span>
            </div>

            {/* Log entries */}
            <div className="max-h-[500px] overflow-y-auto space-y-0.5 font-mono text-xs">
                {filteredLogs.length === 0 && (
                    <div className="text-gray-600 text-center py-8">No logs yet. Run the campaign to see execution logs.</div>
                )}
                {filteredLogs.map((log, idx) => (
                    <div key={log.id || idx} className="flex items-start gap-2 px-2 py-1 hover:bg-gray-800/30 rounded">
                        <span className="text-gray-600 shrink-0 w-[70px]">
                            {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                        <span className={`shrink-0 w-[60px] font-semibold ${levelColors[log.level] || 'text-gray-500'}`}>
                            {log.level?.toUpperCase()}
                        </span>
                        <span className="text-purple-400 shrink-0 w-[100px] truncate" title={log.instance_id}>
                            {log.instance_id || '-'}
                        </span>
                        <span className="text-yellow-500/70 shrink-0 w-[100px] truncate" title={log.event}>
                            {log.event}
                        </span>
                        <span className="text-gray-300 flex-1 break-all">
                            {log.message}
                            {log.data_json && (
                                <span className="text-gray-600 ml-2">
                                    {log.data_json.length > 120 ? log.data_json.slice(0, 120) + '…' : log.data_json}
                                </span>
                            )}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Registry ───────────────────────────────────────

// Import NodeStatusGrid dynamically to avoid circular deps
const DETAIL_REGISTRY: Record<string, React.FC<DetailSectionProps>> = {
    ExecutionLogView,
}

/**
 * Look up a React section component by name (from YAML `detail_page.sections`).
 */
export function getDetailComponent(name: string): React.FC<DetailSectionProps> | null {
    return DETAIL_REGISTRY[name] || null
}

/**
 * Register a custom detail section component.
 */
export function registerDetailComponent(name: string, component: React.FC<DetailSectionProps>) {
    DETAIL_REGISTRY[name] = component
}

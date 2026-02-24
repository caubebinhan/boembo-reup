/**
 * Upload Local — Campaign Detail View
 * 
 * This file OWNS all state for the Upload Local workflow:
 * - Local file list from campaign params
 * - Per-file publish status from execution logs
 * 
 * State shape is completely different from TikTok Repost — as it should be.
 */
import { useState, useEffect, useCallback } from 'react'
import { PipelineVisualizer } from '@renderer/detail/shared/PipelineVisualizer'
import type { WorkflowDetailProps } from '@renderer/detail/WorkflowDetailRegistry'

// ── Upload Local State ──────────────────────────────
interface LocalFile {
    name: string
    path: string
    caption?: string
    status: 'pending' | 'uploading' | 'published' | 'failed'
    error?: string
    published_url?: string
}

interface UploadLocalState {
    files: LocalFile[]
    publishedCount: number
    failedCount: number
    isRunning: boolean
}

/**
 * Hook: Upload Local state from campaign params + execution logs.
 * Only used inside this file — NOT a core hook.
 */
function useUploadLocalState(campaignId: string, config: any): UploadLocalState {
    const [state, setState] = useState<UploadLocalState>({
        files: [],
        publishedCount: 0,
        failedCount: 0,
        isRunning: false,
    })

    const rebuild = useCallback(async () => {
        const localFiles: any[] = config.local_files || []

        // Start with files from config
        const fileMap = new Map<string, LocalFile>()
        for (const f of localFiles) {
            fileMap.set(f.path || f.name, {
                name: f.name,
                path: f.path || f.name,
                caption: f.caption,
                status: 'pending',
            })
        }

        let isRunning = false

        try {
            // @ts-ignore
            const logs: any[] = await window.api.invoke('campaign:get-logs', { id: campaignId, limit: 300 })
            if (logs?.length) {
                for (const log of [...logs].reverse()) {
                    if (log.event === 'node:start') isRunning = true
                    if (log.event === 'campaign:finished') isRunning = false

                    // Match publish results to files
                    if (log.event === 'node:end' && log.node_id?.includes('publisher')) {
                        const data = log.data_json ? tryParse(log.data_json) : null
                        if (data?.resultSummary) {
                            // Mark files as published based on log data
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[UploadLocalDetail] Failed to rebuild state:', err)
        }

        const files = Array.from(fileMap.values())
        setState({
            files,
            publishedCount: files.filter(f => f.status === 'published').length,
            failedCount: files.filter(f => f.status === 'failed').length,
            isRunning,
        })
    }, [campaignId, config])

    useEffect(() => {
        rebuild()
        const timer = setInterval(rebuild, 3000)
        return () => clearInterval(timer)
    }, [rebuild])

    return state
}

// ── Main Component ──────────────────────────────────

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
    pending: { label: 'PENDING', color: '#6b7280' },
    uploading: { label: 'UPLOADING', color: '#3b82f6' },
    published: { label: 'PUBLISHED', color: '#10b981' },
    failed: { label: 'FAILED', color: '#ef4444' },
}

function UploadLocalDetail({ campaignId, campaign, workflowId }: WorkflowDetailProps) {
    const config = (() => {
        try { return typeof campaign?.params === 'string' ? JSON.parse(campaign.params) : (campaign?.params || {}) }
        catch { return {} }
    })()

    const state = useUploadLocalState(campaignId, config)

    return (
        <div className="space-y-5">
            {/* Stats */}
            <div className="flex gap-4">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-800 bg-gray-900/50">
                    <span className="text-lg">📁</span>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Files</p>
                        <p className="text-xl font-bold text-purple-400">{state.files.length}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-800 bg-gray-900/50">
                    <span className="text-lg">📤</span>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Published</p>
                        <p className="text-xl font-bold text-green-400">{state.publishedCount}</p>
                    </div>
                </div>
                {state.failedCount > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-800 bg-gray-900/50">
                        <span className="text-lg">❌</span>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500">Failed</p>
                            <p className="text-xl font-bold text-red-400">{state.failedCount}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Pipeline */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Pipeline</p>
                <PipelineVisualizer campaignId={campaignId} workflowId={workflowId} />
            </div>

            {/* File List */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-3">📁 Files</p>
                <div className="space-y-2">
                    {state.files.map((file, i) => {
                        const sc = STATUS_COLORS[file.status] || STATUS_COLORS.pending
                        return (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900/50 border border-gray-800">
                                <span className="text-xl">🎬</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{file.name}</p>
                                    {file.caption && <p className="text-xs text-gray-500 truncate">{file.caption}</p>}
                                    {file.error && <p className="text-xs text-red-400 truncate">⚠ {file.error}</p>}
                                </div>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ color: sc.color, backgroundColor: `${sc.color}15` }}>
                                    {sc.label}
                                </span>
                            </div>
                        )
                    })}
                    {state.files.length === 0 && (
                        <div className="text-gray-600 text-sm text-center py-6">No files configured.</div>
                    )}
                </div>
            </div>
        </div>
    )
}

function tryParse(json: string): any {
    try { return JSON.parse(json) }
    catch { return null }
}

export default UploadLocalDetail

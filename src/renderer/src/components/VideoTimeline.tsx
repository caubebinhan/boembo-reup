import { useSelector } from 'react-redux'
import { RootState } from '../store/store'

export function VideoTimeline({ campaignId }: { campaignId: string }) {
    const tasks = useSelector((state: RootState) =>
        Object.values(state.pipeline.tasks).filter(t => t.campaignId === campaignId)
    )

    // Sort by scheduledAt
    const sorted = [...tasks].sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0))

    return (
        <div className="space-y-4">
            <h3 className="font-bold text-lg mb-4">Video Pipeline</h3>
            {sorted.length === 0 && <p className="text-sm text-gray-500">No videos in pipeline yet.</p>}

            <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                {sorted.map(task => (
                    <div key={task.id} className="relative pl-6">
                        <div className={`absolute -left-2 top-1.5 w-4 h-4 rounded-full border-2 border-white ${task.status === 'posted' ? 'bg-green-500' :
                                task.status === 'failed' ? 'bg-red-500' :
                                    task.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                                        'bg-gray-300'
                            }`} />

                        <div className="bg-white border rounded shadow-sm p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium text-gray-900">{task.title || task.id}</h4>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {task.scheduledAt ? new Date(task.scheduledAt).toLocaleString() : 'Unscheduled'}
                                    </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full uppercase tracking-wide font-semibold ${task.status === 'posted' ? 'bg-green-100 text-green-700' :
                                        task.status === 'failed' ? 'bg-red-100 text-red-700' :
                                            task.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-700'
                                    }`}>
                                    {task.status}
                                </span>
                            </div>
                            {task.error && (
                                <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                                    Error: {task.error}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

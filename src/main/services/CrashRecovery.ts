import { db } from '../db/Database'
import { PipelineEventBus } from '../../core/engine/PipelineEventBus'

export class CrashRecoveryService {
  static recoverPendingTasks() {
    console.log('Scanning for pending/interrupted tasks for crash recovery...')
    try {
      const pendingVideos = db.prepare(`SELECT * FROM video_queue WHERE status IN ('downloading', 'processing', 'retrying')`).all()
      
      if (pendingVideos.length > 0) {
        console.log(`Recovering ${pendingVideos.length} interrupted video tasks...`)
        
        // Push updates to mark them as pending or failed, or requeue them depending on logic
        for (const video of pendingVideos as any[]) {
          // Revert processing/downloading back to pending so scheduler picks it up again
          db.prepare(`UPDATE video_queue SET status = 'pending' WHERE id = ?`).run(video.id)
          
          PipelineEventBus.emit('pipeline:info', { 
            message: `Recovered video ${video.id} to "pending" status after crash` 
          })
        }
      } else {
        console.log('No interrupted tasks found.')
      }

      // Similarly recover running campaigns
      const _runningCampaigns = db.prepare(`SELECT * FROM campaigns WHERE status = 'running'`).all()
      // ... restart scheduler for runningCampaigns ...

    } catch (err) {
      console.error('Failed to run crash recovery', err)
    }
  }
}

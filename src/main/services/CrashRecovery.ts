import { db } from '../db/Database'
import { PipelineEventBus } from '../../core/engine/PipelineEventBus'

export class CrashRecoveryService {
  static recoverPendingTasks() {
    console.log('Scanning for pending/interrupted tasks for crash recovery...')
    try {
      const pendingJobs = db.prepare(`SELECT * FROM jobs WHERE status = 'running'`).all() as any[]
      
      if (pendingJobs.length > 0) {
        console.log(`Recovering ${pendingJobs.length} interrupted job tasks...`)
        
        for (const job of pendingJobs) {
          db.prepare(`UPDATE jobs SET status = 'pending' WHERE id = ?`).run(job.id)
          
          PipelineEventBus.emit('pipeline:info', { 
            message: `Recovered job ${job.id} to "pending" status after crash` 
          })
        }
      } else {
        console.log('No interrupted jobs found.')
      }

      // No need to restart scheduler manually here as JobQueue logic takes over
    } catch (err) {
      console.error('Failed to run crash recovery', err)
    }
  }
}

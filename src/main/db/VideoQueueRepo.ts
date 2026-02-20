import { db } from './Database'

export class VideoQueueRepo {
  static updateStatus(videoId: string, status: string) {
    if (!videoId) return
    const stmt = db.prepare(`
      UPDATE video_queue 
      SET status = ?, 
          updated_at = ? 
      WHERE id = ?
    `)
    stmt.run(status, Date.now(), videoId)
  }
}

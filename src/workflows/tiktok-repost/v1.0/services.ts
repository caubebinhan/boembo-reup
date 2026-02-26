/**
 * tiktok-repost workflow services
 * ────────────────────────────────
 * Auto-discovered by src/workflows/index.ts
 * Registers async task handlers specific to this workflow.
 */

// Importing the handler triggers self-registration with asyncTaskRegistry
import '@main/tiktok/publisher/PublishVerifyHandler'
import '@main/tiktok/scanner/ThumbnailBatchHandler'
import { setupScannerIPC } from '@main/ipc/scanner'

export function setup() {
  // Register TikTok-specific IPC handlers
  setupScannerIPC()
  console.log('[tiktok-repost/services] Async task handlers + IPC registered')
}

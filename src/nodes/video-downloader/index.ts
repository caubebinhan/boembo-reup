import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.downloader',
  name: 'Video Downloader',
  label: 'Download',
  color: '#3b82f6',
  category: 'transform',
  icon: '⬇️',
  description: 'Download videos from TikTok',
  errorPrefix: 'DWN',
  retryPolicy: {
    maxRetries: 3,
    backoff: 'exponential',
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    retryableErrors: ['ENOTFOUND', 'ECONNRESET', 'timeout', 'net::', 'Download failed'],
  },
  behavior: {
    sideEffects: ['network_call', 'writes_to_disk'],
    idempotent: true,
    crashBehavior: 'skip_video',
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

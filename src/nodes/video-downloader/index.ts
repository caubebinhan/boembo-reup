import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.media_downloader',
  name: 'Video Downloader',
  label: 'Download',
  color: '#3b82f6',
  category: 'transform',
  icon: '⬇️',
  description: 'Download videos from TikTok',
  retryPolicy: {
    maxRetries: 3,
    backoff: 'exponential',
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    retryableErrors: ['ENOTFOUND', 'ECONNRESET', 'timeout', 'net::', 'Download failed'],
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

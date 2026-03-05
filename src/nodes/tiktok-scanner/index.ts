import { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'tiktok.scanner',
  name: 'TikTok Scanner',
  label: 'Scanner',
  color: '#8b5cf6',
  category: 'source',
  icon: '🔍',
  description: 'Scan TikTok channels and keywords for videos',
  editable_settings: { fields: [] },
  retryPolicy: {
    maxRetries: 2,
    backoff: 'exponential',
    initialDelayMs: 3000,
    maxDelayMs: 30000,
    retryableErrors: ['ENOTFOUND', 'ECONNRESET', 'timeout', 'net::'],
  },
}

const node: NodeDefinition = { manifest, execute }
export default node

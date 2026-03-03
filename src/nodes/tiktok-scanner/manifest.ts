import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'tiktok.scanner',
  name: 'TikTok Scanner',
  label: 'Scanner',
  color: '#8b5cf6',
  category: 'source',
  icon: '🔍',
  description: 'Scan TikTok channels and keywords for videos',
  editable_settings: { fields: [] },
  errorPrefix: 'SCN',
  retryPolicy: {
    maxRetries: 2,
    backoff: 'exponential',
    initialDelayMs: 3000,
    maxDelayMs: 30000,
    retryableErrors: ['ENOTFOUND', 'ECONNRESET', 'timeout', 'net::'],
  },
  behavior: {
    sideEffects: ['network_call', 'browser_session'],
    idempotent: true,
    crashBehavior: 'retry',
  },
}

export default manifest

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
}

export default manifest

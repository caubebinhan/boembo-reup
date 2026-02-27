import { NodeManifest } from '@core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'core.video_edit',
  name: 'Video Editor',
  label: 'Edit',
  color: '#8b5cf6',
  category: 'transform',
  icon: '🎬',
  description: 'Process video with configurable editing plugins (watermark, crop, anti-detect, etc.)',
}

export default manifest

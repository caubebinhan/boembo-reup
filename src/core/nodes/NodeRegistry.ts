import { NodeDefinition } from './NodeDefinition'
import { TikTokScannerNode } from '../../nodes/sources/TikTokScannerNode'
import { DeduplicatorNode } from '../../nodes/filters/DeduplicatorNode'
import { QualityFilterNode } from '../../nodes/filters/QualityFilterNode'
import { LimitNode } from '../../nodes/filters/LimitNode'
import { VideoDownloaderNode } from '../../nodes/transforms/VideoDownloaderNode'
import { CaptionGeneratorNode } from '../../nodes/transforms/CaptionGeneratorNode'
import { TikTokPublisherNode } from '../../nodes/publishers/TikTokPublisherNode'

export class NodeRegistry {
  private nodes = new Map<string, NodeDefinition>()

  register(node: NodeDefinition) {
    this.nodes.set(node.id, node)
  }

  get(id: string): NodeDefinition | undefined {
    return this.nodes.get(id)
  }

  getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values())
  }
}

export const nodeRegistry = new NodeRegistry()

// Register all system nodes
nodeRegistry.register(TikTokScannerNode)
nodeRegistry.register(DeduplicatorNode)
nodeRegistry.register(QualityFilterNode)
nodeRegistry.register(LimitNode)
nodeRegistry.register(VideoDownloaderNode)
nodeRegistry.register(CaptionGeneratorNode)
nodeRegistry.register(TikTokPublisherNode)

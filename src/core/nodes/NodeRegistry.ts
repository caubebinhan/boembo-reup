import { NodeDefinition } from './NodeDefinition'

export class NodeRegistry {
  private nodes = new Map<string, NodeDefinition>()

  register(node: NodeDefinition) {
    this.nodes.set(node.manifest.id, node)
  }

  get(id: string): NodeDefinition | undefined {
    return this.nodes.get(id)
  }

  getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values())
  }

  getAllManifests() {
    return this.getAll().map(n => n.manifest)
  }
}

export const nodeRegistry = new NodeRegistry()

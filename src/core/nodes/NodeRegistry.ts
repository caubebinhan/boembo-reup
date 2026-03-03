import { NodeDefinition } from './NodeDefinition'

export class NodeRegistry {
  private nodes = new Map<string, NodeDefinition>()

  register(node: NodeDefinition) {
    const id = node.manifest.id
    if (this.nodes.has(id)) {
      console.warn(`[NodeRegistry] ⚠ Duplicate node id "${id}" — overwriting previous registration`)
    }
    this.nodes.set(id, node)
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

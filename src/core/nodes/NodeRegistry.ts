import { NodeDefinition } from './NodeDefinition'

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

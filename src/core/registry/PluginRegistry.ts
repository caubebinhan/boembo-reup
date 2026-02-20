import { INode } from '../types/INode'

type NodeConstructor = new () => INode

export class PluginRegistry {
  private static nodes = new Map<string, NodeConstructor>()

  static register(type: string, nodeClass: NodeConstructor) {
    this.nodes.set(type, nodeClass)
  }

  static get(type: string): INode {
    const NodeClass = this.nodes.get(type)
    if (!NodeClass) {
      throw new Error(`Node type '${type}' not registered in PluginRegistry`)
    }
    return new NodeClass()
  }
}

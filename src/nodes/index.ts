/**
 * Node Auto-Discovery
 * ───────────────────
 * Uses import.meta.glob to automatically discover and register all nodes.
 * To add a new node: create a folder in src/nodes/ with index.ts that exports default NodeDefinition.
 * No manual imports needed — just drop the folder and it's registered.
 */
import { nodeRegistry } from '../core/nodes/NodeRegistry'
import type { NodeDefinition } from '../core/nodes/NodeDefinition'

const modules = import.meta.glob('./**/index.ts', { eager: true })

let count = 0
for (const [path, mod] of Object.entries(modules)) {
  // Skip self (./index.ts)
  if (path === './index.ts') continue

  const m = mod as { default?: NodeDefinition }
  if (m.default?.manifest?.id) {
    nodeRegistry.register(m.default)
    count++
  }
}

console.log(`[NodeRegistry] Auto-discovered ${count} nodes`)

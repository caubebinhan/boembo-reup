/**
 * core.parallel — Fork node.
 *
 * Takes input data and fans it out to N branches concurrently.
 * Each branch receives the same input data. The engine creates
 * one job per branch, all tagged with a shared `_parallelGroup` UUID.
 *
 * This node does NOT execute branch logic itself — it only signals
 * the FlowEngine to create branch jobs. The engine's `executeParallel()`
 * handles the actual job creation.
 *
 * YAML usage:
 *   - node_id: core.parallel
 *     instance_id: publish_fork
 *     children: [tiktok_pub, youtube_pub]
 *     params:
 *       onBranchFail: continue   # 'fail_all' | 'continue' (default: continue)
 */
import type { NodeDefinition } from './NodeDefinition'

const ParallelNode: NodeDefinition = {
  manifest: {
    id: 'core.parallel',
    name: 'Parallel Fork',
    label: '⑃ Fork',
    color: '#7c3aed',
    category: 'control',
    icon: '⑃',
    description: 'Fan-out: run multiple branches concurrently with the same input',
  },

  async execute(_input, _ctx) {
    // The engine intercepts this node before execute() is called.
    // If we reach here, it means the engine didn't handle it —
    // return continue as a safe fallback.
    return { action: 'continue', data: _input }
  },
}

export default ParallelNode

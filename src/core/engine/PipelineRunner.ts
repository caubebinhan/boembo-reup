import { NodeConfig } from '../types/WorkflowConfig'
import { Context } from '../types/Context'
import { PluginRegistry } from '../registry/PluginRegistry'
import { ForEachRunner } from './ForEachRunner'
import * as Sentry from '@sentry/node'

export class PipelineRunner {
  static async run(nodes: NodeConfig[], ctx: Context): Promise<void> {
    return Sentry.startSpan({ name: `pipeline_run_${ctx.campaignId}`, op: 'pipeline' }, async () => {
      const nodeMap = new Map(nodes.map(n => [n.id, n]))
      let currentId: string | undefined = nodes[0]?.id

      while (currentId) {
        const cfg = nodeMap.get(currentId)
        if (!cfg) break

        // Condition checking
        if (cfg.condition && !ctx.resolveParam(cfg.condition)) {
          currentId = cfg.on_success
          continue
        }

        ctx.emit('node:start', { nodeId: cfg.id })

        try {
          if (cfg.node === 'ForEach') {
            await ForEachRunner.run(cfg, ctx)
            currentId = cfg.on_success
            continue
          }

          const node = PluginRegistry.get(cfg.node)
          
          // Resolve all params before executing
          const resolvedParams: Record<string, any> = {}
          for (const [key, value] of Object.entries(cfg.params)) {
            resolvedParams[key] = ctx.resolveParam(value)
          }
          
          node.params = resolvedParams
          const result = await node.execute(ctx)

          Object.assign(ctx.variables, result.data ?? {})
          ctx.emit('node:done', { nodeId: cfg.id, result })

          if (result.status === 'empty' && cfg.on_empty?.action === 'stop') {
            return
          }

          currentId = cfg.on_success
        } catch (err: any) {
          ctx.emit('pipeline:error', { error: err, nodeId: cfg.id })
          throw err
        }
      }
    })
  }
}

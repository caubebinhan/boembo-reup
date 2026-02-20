import { NodeConfig } from '../types/WorkflowConfig'
import { Context } from '../types/Context'
import { PipelineRunner } from './PipelineRunner'

export class ForEachRunner {
  static async run(cfg: NodeConfig, ctx: Context): Promise<void> {
    const items = ctx.resolveParam(cfg.params.source_key)
    if (!Array.isArray(items)) {
      throw new Error(`ForEach: source_key '${cfg.params.source_key}' must resolve to an array.`)
    }

    const itemVar = cfg.params.item_var || 'item'
    const bodyNodes = cfg.body || []

    for (const item of items) {
      ctx.variables[itemVar] = item
      
      try {
        await PipelineRunner.run(bodyNodes, ctx)
        ctx.stats.posted++
      } catch (err) {
        if (cfg.params.on_item_error === 'skip_and_continue') {
          ctx.stats.failed++
          continue
        }
        throw err
      }
    }
  }
}

import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

/**
 * Condition Node
 *
 * Evaluates a JS expression against the incoming data and emits a `branch`
 * field in the output. Downstream conditional edges use this to route:
 *
 *   edges:
 *     - from: condition_1
 *       to: notify_violation_1
 *       when: "branch === 'true'"
 *     - from: condition_1
 *       to: some_other_node
 *       when: "branch === 'false'"
 *
 * The expression runs in a sandboxed Function with `data` as the only variable.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const expression: string = ctx.params.expression || 'false'

  let result = false
  try {
    const safeData = typeof input === 'object' && input !== null ? input : {}
    // Spread data keys as named args — same as safeEval() in FlowEngine.
    // This lets flow.yaml write `status === 'violation'` instead of `data.status === 'violation'`.
    const fn = new Function(...Object.keys(safeData), 'params',
      `"use strict"; return Boolean(${expression})`)
    result = fn(...Object.values(safeData), ctx.params)
  } catch (e: any) {
    ctx.logger.error(`[Condition] Expression error: ${e.message}`)
    result = false
  }

  const branch = result ? 'true' : 'false'
  ctx.logger.info(`[Condition] "${expression}" → ${branch}`)
  ctx.onProgress(`🔀 Branch: ${branch}`)

  return {
    data: { ...input, branch },
    action: 'continue',
    message: `branch=${branch}`,
  }
}

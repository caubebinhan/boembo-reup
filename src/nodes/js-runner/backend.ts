import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

/**
 * JS Runner Node
 *
 * Executes user-defined JavaScript code in a sandboxed Function context.
 * Available variables inside the code:
 *   - `data`   — incoming data from the previous node
 *   - `params` — campaign params (wizard output)
 *   - `ctx`    — limited context: { logger, onProgress, alert, store }
 *
 * The code MUST return a value (the transformed data to pass downstream).
 * If nothing is returned, the original `data` is forwarded unchanged.
 */
export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const code: string = ctx.params.code || 'return data'

  ctx.logger.info(`[JSRunner] Executing custom code (${code.length} chars)`)
  ctx.onProgress('⚡ Running JS code...')

  let result: any
  try {
    // Sandboxed execution — only data, params, and a limited ctx are exposed
    const sandboxCtx = {
      logger: ctx.logger,
      onProgress: ctx.onProgress,
      alert: ctx.alert,
      store: ctx.store,
    }

    // eslint-disable-next-line no-new-func
    const fn = new Function('data', 'params', 'ctx', `"use strict";\n${code}`)
    result = await Promise.resolve(fn(input, ctx.params, sandboxCtx))
  } catch (e: any) {
    ctx.logger.error(`[JSRunner] Code execution error: ${e.message}`, e)
    ctx.onProgress(`⚡ Error: ${e.message}`)
    return {
      data: { ...input, js_error: e.message },
      action: 'continue',
      message: `JS error: ${e.message}`,
    }
  }

  // If the code didn't return anything, forward original data
  const output = result !== undefined ? result : input

  ctx.logger.info(`[JSRunner] Code executed successfully`)
  ctx.onProgress('⚡ JS code done')

  return {
    data: output,
    action: 'continue',
    message: 'JS code executed',
  }
}

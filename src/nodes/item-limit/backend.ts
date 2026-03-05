import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const max = ctx.params.maxItemCount ?? 100
    const videos = Array.isArray(input) ? input : [input]
    const limited = videos.slice(0, max)

    if (limited.length < videos.length) {
        ctx.logger.info(`[ItemLimit] Capped from ${videos.length} to ${limited.length} items (max=${max})`)
        ctx.onProgress(`Giới hạn ${limited.length}/${videos.length} video.`)
    } else {
        ctx.logger.info(`[ItemLimit] All ${videos.length} items within limit (max=${max})`)
    }

    return { data: limited, action: 'continue', message: `${limited.length} items (max ${max})` }
}

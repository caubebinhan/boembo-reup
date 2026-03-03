import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { failBatchGracefully } from '@core/nodes/NodeHelpers'

const INSTANCE_ID = 'file_source_1'

export async function execute(_input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  try {
    const localFiles = ctx.params.local_files || []

    if (localFiles.length === 0) {
      return failBatchGracefully(ctx, INSTANCE_ID, 'no_files',
        'No local files provided')
    }

    const videos = localFiles.map((file: any, i: number) => ({
      platform_id: `local_${Date.now()}_${i}`,
      platform: 'local',
      url: '',
      description: file.caption || file.name || '',
      author: 'local',
      author_id: '',
      thumbnail: '',
      duration_seconds: 0,
      stats: {},
      tags: [],
      created_at: Date.now(),
      local_path: file.path,
      source_meta: { source_type: 'local_file', source_name: file.name || file.path }
    }))

    ctx.logger.info(`FileSource: loaded ${videos.length} local files`)
    return { data: videos }
  } catch (err: any) {
    ctx.logger.error(`[FileSource] Unexpected error: ${err?.message || err}`)
    throw err
  }
}

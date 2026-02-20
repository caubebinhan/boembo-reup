import { Context } from '../core/types/Context'
import { INode, NodeResult } from '../core/types/INode'
import fs from 'fs'

export class LocalFileCleanup implements INode {
  id = ''
  type = 'LocalFileCleanup'
  params: any = {}

  async execute(ctx: Context): Promise<NodeResult> {
    const paths = Array.isArray(this.params.paths) ? this.params.paths : [this.params.path]
    
    for (const p of paths) {
      if (p) {
        try {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p)
            ctx.emit('pipeline:info', { message: `Cleaned up ${p}` })
          }
        } catch (err) {
          ctx.emit('pipeline:error', { error: `Failed to clean up ${p}` })
        }
      }
    }

    return { status: 'cleaned' }
  }
}

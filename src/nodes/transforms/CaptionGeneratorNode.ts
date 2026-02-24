import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'
import { nodeRegistry } from '../../core/nodes/NodeRegistry'

export const CaptionGeneratorNode: NodeDefinition = {
  id: 'core.caption_gen',
  name: 'Caption Generator',
  category: 'transform',
  icon: '📋',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const video = input
    const template = ctx.params.captionTemplate || ctx.params.caption_template || '{original}'
    const removeHashtags = ctx.params.removeHashtags ?? ctx.params.remove_hashtags ?? false
    const appendTags = ctx.params.appendTags || ctx.params.append_tags || ''

    let original = video.description || ''
    if (removeHashtags) {
      original = original.replace(/#[\w\u0400-\u04FF\u00C0-\u024F]+/gu, '').trim()
    }

    let caption = template
      .replace('{original}', original)
      .replace('{author}', video.author || '')
      .replace('{time}', new Date().toLocaleTimeString('en', { hour12: false }))
      .replace('{date}', new Date().toLocaleDateString('en-CA'))
      .replace('{tags}', video.tags?.join(' ') || '')

    if (appendTags) {
      caption = caption.trim() + ' ' + appendTags
    }

    ctx.logger.info(`Caption: "${caption.slice(0, 60)}..."`)
    return { data: { ...video, generated_caption: caption } }
  }
}

nodeRegistry.register(CaptionGeneratorNode)

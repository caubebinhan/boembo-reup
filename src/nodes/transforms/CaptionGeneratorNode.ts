import { NodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export const CaptionGeneratorNode: NodeDefinition = {
  id: 'core.caption_gen',
  name: 'Caption Generator',
  category: 'transform',
  
  default_execution: { strategy: 'inline' },

  config_schema: {
    fields: [
      {
        key: 'template',
        label: 'Caption Template',
        type: 'string',
        default: '{original}',
        description: 'Variables: {original} {author} {time} {date} {tags}'
      },
      {
        key: 'remove_hashtags',
        label: 'Remove Original Hashtags',
        type: 'boolean',
        default: false
      },
      {
        key: 'append_tags',
        label: 'Append Tags',
        type: 'string',
        default: '',
        description: 'Space-separated tags to append: #fyp #viral'
      }
    ]
  },

  input_type: 'video_single',
  output_type: 'video_single',

  async execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const video = input.data as any
    const { template, remove_hashtags, append_tags } = ctx.config
    
    let original = video.description || ''
    if (remove_hashtags) {
      original = original.replace(/#\w+/g, '').trim()
    }
    
    let caption = template
      .replace('{original}', original)
      .replace('{author}', video.author || '')
      .replace('{time}', new Date().toLocaleTimeString('en', { hour12: false }))
      .replace('{date}', new Date().toLocaleDateString('en-CA'))
      .replace('{tags}', video.tags?.join(' ') || '')
    
    if (append_tags) {
      caption = caption.trim() + ' ' + append_tags
    }
    
    return {
      type: 'video_single',
      data: { ...video, generated_caption: caption },
      emit_mode: 'each'
    }
  }
}

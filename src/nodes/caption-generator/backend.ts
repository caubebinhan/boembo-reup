import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  const template = ctx.params.captionTemplate || ctx.params.caption_template || '{original}'
  const removeHashtags = ctx.params.removeHashtags ?? ctx.params.remove_hashtags ?? false
  const appendTags = ctx.params.appendTags || ctx.params.append_tags || ''

  let original = video.description || ''
  if (removeHashtags) {
    original = original.replace(/#[\w\u0400-\u04FF\u00C0-\u024F]+/gu, '').trim()
  }

  const timeStr = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date().toLocaleDateString('en-CA')

  // Support BOTH formats:
  //   Wizard UI uses: [Original Desc] [Author] [Tags] [Time (HH:mm)] [Date (YYYY-MM-DD)]
  //   Legacy format:  {original} {author} {tags} {time} {date}
  let caption = template
    // Wizard bracket format (from Step1_Details tag buttons)
    .replace('[Original Desc]', original)
    .replace('[No Hashtags]', original.replace(/#[\w\u0400-\u04FF\u00C0-\u024F]+/gu, '').trim())
    .replace('[Author]', video.author || '')
    .replace('[Tags]', video.tags?.join(' ') || '')
    .replace(/\[Time \(HH:mm\)\]/g, timeStr)
    .replace(/\[Date \(YYYY-MM-DD\)\]/g, dateStr)
    // Legacy curly format (backward compat)
    .replace('{original}', original)
    .replace('{author}', video.author || '')
    .replace('{time}', timeStr)
    .replace('{date}', dateStr)
    .replace('{tags}', video.tags?.join(' ') || '')

  if (appendTags) {
    caption = caption.trim() + ' ' + appendTags
  }

  ctx.logger.info(`Caption: "${caption.slice(0, 80)}..."`)
  return { data: { ...video, generated_caption: caption } }
}


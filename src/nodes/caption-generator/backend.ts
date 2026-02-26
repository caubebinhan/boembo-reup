import { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const video = input
  const template = ctx.params.captionTemplate || '[Original Desc]'
  const removeHashtags = ctx.params.removeHashtags ?? false
  const appendTags = ctx.params.appendTags || ''

  let original = video.description || ''
  if (removeHashtags) {
    original = original.replace(/#[\w\u0400-\u04FF\u00C0-\u024F]+/gu, '').trim()
  }

  const timeStr = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date().toLocaleDateString('en-CA')

  // Bracket format (from Step1_Details tag buttons in Wizard UI)
  let caption = template
    .replace('[Original Desc]', original)
    .replace('[No Hashtags]', original.replace(/#[\w\u0400-\u04FF\u00C0-\u024F]+/gu, '').trim())
    .replace('[Author]', video.author || '')
    .replace('[Tags]', video.tags?.join(' ') || '')
    .replace(/\[Time \(HH:mm\)\]/g, timeStr)
    .replace(/\[Date \(YYYY-MM-DD\)\]/g, dateStr)

  if (appendTags) {
    caption = caption.trim() + ' ' + appendTags
  }

  // Persist transformed caption to campaign document so timeline (which reads DB) shows it.
  if (video?.platform_id) {
    const existing = ctx.store.findVideo(video.platform_id)
    ctx.store.updateVideo(video.platform_id, {
      status: 'captioned',
      data: {
        ...(existing?.data || {}),
        ...video,
        generated_caption: caption,
      },
    })
    ctx.store.save()
  }

  ctx.logger.info(`Caption: "${caption.slice(0, 80)}..."`)
  return { data: { ...video, generated_caption: caption } }
}

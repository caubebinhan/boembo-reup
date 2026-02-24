import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

/**
 * Notify Node
 *
 * Sends a native desktop notification using Electron's Notification API.
 * Runs in the main process — no IPC needed.
 *
 * Template variables: any field from input data, e.g. {{status}}, {{description}}, {{author}}
 */

function interpolate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key]
    if (val == null) return ''
    return String(val).slice(0, 100) // cap length
  })
}

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const rawTitle = ctx.params.title || 'Boembo'
  const rawBody = ctx.params.body || ''
  const sound = ctx.params.sound !== false

  const data = typeof input === 'object' && input !== null ? input : {}
  const title = interpolate(rawTitle, data)
  const body = interpolate(rawBody, data)

  ctx.logger.info(`[Notify] Sending notification: "${title}" — "${body}"`)

  try {
    const { Notification } = await import('electron')

    if (!Notification.isSupported()) {
      ctx.logger.info('[Notify] Notifications not supported on this system — skipping')
    } else {
      const notif = new Notification({
        title,
        body: body || undefined,
        silent: !sound,
        // Use app icon if available
        icon: undefined,
      })
      notif.show()
      ctx.logger.info('[Notify] 🔔 Notification sent')
    }
  } catch (e: any) {
    ctx.logger.error(`[Notify] Failed to send notification: ${e.message}`)
  }

  ctx.onProgress(`🔔 Notification sent: ${title}`)
  // Pass data through unchanged — notify is a side-effect only
  return { data: input, action: 'continue', message: `Notification: ${title}` }
}

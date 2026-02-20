import { Campaign, Context } from '../types/Context'
import { PipelineEventBus } from './PipelineEventBus'
import { get } from 'lodash'

export class ContextManager {
  static create(campaign: Campaign): Context {
    const ctx: Context = {
      campaignId: campaign.id,
      campaign,
      variables: {},
      stats: { posted: 0, failed: 0, skipped: 0 },
      emit: (event: string, payload: any) => {
        PipelineEventBus.emit(event, { ...payload, ctx })
      },
      resolveParam: function (template: string | any): any {
        if (typeof template !== 'string') return template
        
        // Match pure {{path.to.variable}} to preserve base types (numbers, objects)
        const pureMatch = template.match(/^\{\{([^}]+)\}\}$/)
        if (pureMatch) {
          const inner = pureMatch[1].trim()
          
          // Basic filters e.g. {{ now | date(DD/MM/YYYY) }}
          if (inner.includes('|')) {
            const [path, filterRaw] = inner.split('|').map(s => s.trim())
            let val = getPath(this, path)
            
            // Simple filter handling
            if (filterRaw.startsWith('date(')) {
              // Mock formatting for demo
              return new Date(val || Date.now()).toLocaleDateString()
            }
            return val
          }
          
          return getPath(this, inner)
        }

        // Replace within strings: "Hello {{name}}"
        return template.replace(/\{\{([\w\.]+)\}\}/g, (_, path) => {
          const val = getPath(this, path)
          return val !== undefined ? String(val) : ''
        })
      }
    }
    return ctx
  }
}

// Helper to get nested paths like context.stats.posted or campaign.schedule.gap_minutes
function getPath(ctx: Context, path: string): any {
  if (path === 'now') return Date.now()
  if (path.startsWith('campaign.')) return get(ctx.campaign, path.replace('campaign.', ''))
  if (path.startsWith('context.')) return get(ctx, path.replace('context.', ''))
  return get(ctx.variables, path)
}

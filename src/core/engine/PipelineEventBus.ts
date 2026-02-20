import { EventEmitter } from 'events'

class PipelineEventBusEmitter extends EventEmitter {}

export const PipelineEventBus = new PipelineEventBusEmitter()

// Pre-defined event types for type safety (optional, but good practice)
export type EventPayloads = {
  'node:start': { nodeId: string; ctx: any }
  'node:done': { nodeId: string; result: any; ctx: any }
  'pipeline:error': { error: Error; ctx: any }
  'pipeline:done': { campaignId: string }
}

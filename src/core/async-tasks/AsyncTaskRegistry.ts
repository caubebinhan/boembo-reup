import type { AsyncTaskHandler } from './types'

/**
 * Handler registry for async tasks.
 * Nodes register handlers at app startup; scheduler looks up by taskType.
 */
export class AsyncTaskRegistry {
  private handlers = new Map<string, AsyncTaskHandler>()

  register(handler: AsyncTaskHandler): void {
    if (this.handlers.has(handler.taskType)) {
      console.warn(`[AsyncTaskRegistry] Overwriting handler for '${handler.taskType}'`)
    }
    this.handlers.set(handler.taskType, handler)
    console.log(`[AsyncTaskRegistry] Registered handler: ${handler.taskType}`)
  }

  getHandler(taskType: string): AsyncTaskHandler | null {
    return this.handlers.get(taskType) ?? null
  }

  listTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}

export const asyncTaskRegistry = new AsyncTaskRegistry()

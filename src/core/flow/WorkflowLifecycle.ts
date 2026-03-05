/**
 * WorkflowLifecycle — optional hooks that workflows can implement
 * to run custom logic at campaign lifecycle events.
 *
 * Convention: export default as WorkflowLifecycle from
 *   src/workflows/{name}/v{ver}/lifecycle.ts
 *
 * Auto-discovered alongside events.ts by the workflow loader.
 */
export interface WorkflowLifecycle {
  /**
   * Called before campaign starts/resumes. Return errors[] to block.
   * Use this for health checks, pre-validation, etc.
   */
  beforeStart?(campaignId: string, params: Record<string, any>): Promise<{ ok: boolean; errors: string[] }>

  /** Called after campaign reaches terminal state (finished/error/cancelled) */
  onFinished?(campaignId: string, status: string): Promise<void>

  /** Called when campaign is deleted — clean up workflow-specific resources */
  onDelete?(campaignId: string, params: Record<string, any>): Promise<void>

  /** Called when campaign is paused */
  onPause?(campaignId: string): Promise<void>

  /** Called when campaign resumes */
  onResume?(campaignId: string): Promise<void>
}

/**
 * WorkflowLifecycleRegistry — maps workflow IDs to their lifecycle hooks.
 *
 * Singleton, populated at startup by the workflow auto-discovery system.
 * FlowEngine calls hooks via this registry.
 */
class WorkflowLifecycleRegistryImpl {
  private hooks = new Map<string, WorkflowLifecycle>()

  register(workflowId: string, lifecycle: WorkflowLifecycle): void {
    this.hooks.set(workflowId, lifecycle)
    console.log(`[LifecycleRegistry] Registered lifecycle for '${workflowId}'`)
  }

  get(workflowId: string): WorkflowLifecycle | null {
    return this.hooks.get(workflowId) ?? null
  }

  has(workflowId: string): boolean {
    return this.hooks.has(workflowId)
  }
}

export const lifecycleRegistry = new WorkflowLifecycleRegistryImpl()

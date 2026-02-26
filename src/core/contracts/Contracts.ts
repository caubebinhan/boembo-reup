import type { FlowDefinition } from '../flow/ExecutionContracts'
import type { NodeExecutionContext, NodeExecutionResult, NodeManifest } from '../nodes/NodeDefinition'

// ── Workflow Contract ───────────────────────────────
/**
 * What a workflow provides to the core app.
 *
 * This is the boundary between core engine and workflow plugins.
 * When a workflow is installed (from marketplace or local), it must
 * export an object that satisfies this contract.
 *
 * Core only interacts with workflows through this interface —
 * it doesn't know about videos, TikTok, or any domain concept.
 */
export interface WorkflowContract {
  /** Unique workflow identifier, e.g. 'tiktok-repost' */
  id: string
  name: string
  description?: string
  icon?: string
  color?: string

  /** Flow definition (nodes + edges) */
  flow: FlowDefinition

  /** Recovery handler for crash recovery */
  recover?: (campaignId: string) => void

  /** Called when workflow is installed — e.g. seed default data */
  onInstall?: () => void

  /** Called when workflow is uninstalled — cleanup */
  onUninstall?: () => void
}

// ── Node Contract ───────────────────────────────────
/**
 * What a node provides to the engine.
 *
 * Each node is a self-contained unit:
 * - Declares what it is (manifest)
 * - Implements what it does (execute)
 * - Owns its domain logic (counting, status updates, etc.)
 *
 * The core engine calls execute() and follows the result's flow control.
 * The node handles everything else via ctx.store.
 */
export interface NodeContract {
  /** Declarative metadata — describes WHAT the node is */
  manifest: NodeManifest

  /** Execute the node — the node owns ALL domain logic */
  execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult>

  /** Called when node is installed */
  onInstall?: () => void

  /** Called when node is uninstalled */
  onUninstall?: () => void
}

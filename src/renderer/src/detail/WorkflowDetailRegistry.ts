import React from 'react'

export interface WorkflowDetailProps {
  campaignId: string
  campaign: any
  workflowId: string
}

// Workflow Detail Auto-Discovery
// Scans src/workflows/[id]/detail.tsx
// To add a new detail view: create src/workflows/[workflow-id]/detail.tsx
const detailModules = import.meta.glob<any>('../../../workflows/*/detail.tsx')

// Build registry from discovered modules
const REGISTRY: Record<string, () => Promise<any>> = {}
for (const [path, factory] of Object.entries(detailModules)) {
  const parts = path.split('/')
  const detailIdx = parts.findIndex(p => p === 'detail.tsx')
  const workflowId = detailIdx > 0 ? parts[detailIdx - 1] : null
  if (workflowId) {
    REGISTRY[workflowId] = factory
    console.log(`[DetailRegistry] Auto-discovered: ${workflowId}`)
  }
}

// Cache React.lazy components — must not be re-created on every render
const LAZY_CACHE: Record<string, React.LazyExoticComponent<React.FC<WorkflowDetailProps>>> = {}

// Get a lazily-loaded detail component for a workflow (cached)
export function getWorkflowDetailComponent(workflowId: string): React.LazyExoticComponent<React.FC<WorkflowDetailProps>> | null {
  if (LAZY_CACHE[workflowId]) return LAZY_CACHE[workflowId]
  const factory = REGISTRY[workflowId]
  if (!factory) {
    console.warn(`[DetailRegistry] No detail view for "${workflowId}". Available: [${Object.keys(REGISTRY).join(', ')}]`)
    return null
  }
  LAZY_CACHE[workflowId] = React.lazy(factory)
  return LAZY_CACHE[workflowId]
}

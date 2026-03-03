import React from 'react'

export interface WorkflowDetailProps {
  campaignId: string
  campaign: any
  workflowId: string
}

// Workflow Detail Auto-Discovery (Versioned)
// Scans src/workflows/[id]/v[x.y]/detail.tsx
// All versions are loaded so campaigns on different versions use correct UI
const detailModules = import.meta.glob<any>('../../workflows/*/v*/detail.tsx')

// Build registry: workflowId → { version → factory }
const VERSIONED_REGISTRY: Record<string, Record<string, () => Promise<any>>> = {}
for (const [path, factory] of Object.entries(detailModules)) {
  // path like ../../workflows/tiktok-repost/v1.0/detail.tsx
  const match = path.match(/workflows\/([^/]+)\/v([^/]+)\/detail\.tsx$/)
  if (!match) continue
  const [, workflowId, version] = match
  if (!VERSIONED_REGISTRY[workflowId]) VERSIONED_REGISTRY[workflowId] = {}
  VERSIONED_REGISTRY[workflowId][version] = factory
  console.log(`[DetailRegistry] Auto-discovered: ${workflowId} v${version}`)
}

// Cache React.lazy components — must not be re-created on every render
const LAZY_CACHE: Record<string, React.LazyExoticComponent<React.FC<WorkflowDetailProps>>> = {}

/**
 * Get a lazily-loaded detail component for a workflow+version (cached).
 * Falls back to latest version if requested version not found.
 */
export function getWorkflowDetailComponent(
  workflowId: string,
  workflowVersion?: string
): React.LazyExoticComponent<React.FC<WorkflowDetailProps>> | null {
  const cacheKey = `${workflowId}@${workflowVersion || 'latest'}`
  if (LAZY_CACHE[cacheKey]) return LAZY_CACHE[cacheKey]

  const versions = VERSIONED_REGISTRY[workflowId]
  if (!versions) {
    console.warn(`[DetailRegistry] No detail view for "${workflowId}". Available: [${Object.keys(VERSIONED_REGISTRY).join(', ')}]`)
    return null
  }

  // Resolve factory: exact version → latest
  const normalizedVersion = (workflowVersion || '').replace(/^v/i, '')
  let factory = normalizedVersion ? versions[normalizedVersion] : null
  if (!factory) {
    // Fallback to latest version
    const sorted = Object.keys(versions).sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0)
        if (d !== 0) return d
      }
      return 0
    })
    factory = versions[sorted[sorted.length - 1]]
  }
  if (!factory) return null

  LAZY_CACHE[cacheKey] = React.lazy(factory)
  return LAZY_CACHE[cacheKey]
}

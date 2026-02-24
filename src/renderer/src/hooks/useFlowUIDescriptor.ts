import { useState, useEffect } from 'react'

// Reads UI descriptor from flow.yaml (workflow-agnostic).
// The flow.yaml's 'ui' section drives CampaignCard badges, stats, actions, and detail page layout.
export function useFlowUIDescriptor(workflowId: string) {
  const [descriptor, setDescriptor] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // @ts-ignore
    window.api.invoke('flow:get-ui-descriptor', workflowId)
      .then((ui: any) => { if (!cancelled) setDescriptor(ui) })
      .catch((err: any) => console.error('[useFlowUIDescriptor] Failed:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workflowId])

  return { descriptor, loading }
}

// Safe expression evaluator for YAML-driven UI configs
export function evaluateExpression(expr: string | undefined, ctx: any, fallback: any = null): any {
  if (!expr) return fallback
  try {
    const fn = new Function(...Object.keys(ctx), `return (${expr})`)
    return fn(...Object.values(ctx))
  } catch {
    return fallback
  }
}

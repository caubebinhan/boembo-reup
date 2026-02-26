import { WizardStepConfig } from './WizardStepTypes'

// Wizard Step Auto-Discovery (Versioned)
// Scans src/workflows/[id]/v[x.y]/wizard.ts or wizard.tsx
const wizardModules = import.meta.glob<any>('../../../workflows/*/v*/wizard.{ts,tsx}')

// Build registry: workflowId → lazy factory (latest version wins)
const WIZARD_REGISTRY: Record<string, () => Promise<any>> = {}
for (const [path, factory] of Object.entries(wizardModules)) {
  // path like ../../../workflows/tiktok-repost/v1.0/wizard.ts
  const match = path.match(/workflows\/([^/]+)\/v[^/]+\/wizard\./)
  if (match) {
    WIZARD_REGISTRY[match[1]] = factory
    console.log(`[WizardRegistry] Auto-discovered: ${match[1]}`)
  }
}

// Dynamically load wizard steps for a workflow.
export async function getWizardSteps(workflowId: string): Promise<WizardStepConfig[]> {
  const factory = WIZARD_REGISTRY[workflowId]
  if (!factory) {
    console.warn(`[WizardRegistry] No wizard found for: ${workflowId}. Available: [${Object.keys(WIZARD_REGISTRY).join(', ')}]`)
    return []
  }
  
  try {
    const mod = await factory()
    if (mod.default && Array.isArray(mod.default)) return mod.default
    const values = Object.values(mod)
    const stepsArray = values.find(v => Array.isArray(v))
    if (stepsArray) return stepsArray as WizardStepConfig[]
    console.warn(`[WizardRegistry] Module for ${workflowId} has no step array exports`)
    return []
  } catch (err) {
    console.error(`[WizardRegistry] Failed to load steps for ${workflowId}:`, err)
    return []
  }
}

// Get list of auto-discovered workflow IDs
export function getRegisteredWorkflowIds(): string[] {
  return Object.keys(WIZARD_REGISTRY)
}

export { WIZARD_REGISTRY as workflowWizardRegistry }

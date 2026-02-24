import { WizardStepConfig } from './WizardStepTypes'

// Wizard Step Auto-Discovery
// Scans src/workflows/[id]/wizard.ts or wizard.tsx
// To add a new wizard: create src/workflows/[workflow-id]/wizard.ts
const wizardModules = import.meta.glob<any>('../../../workflows/*/wizard.{ts,tsx}')

// Build registry from discovered modules
const WIZARD_REGISTRY: Record<string, () => Promise<any>> = {}
for (const [path, factory] of Object.entries(wizardModules)) {
  const parts = path.split('/')
  const wizardIdx = parts.findIndex(p => p.match(/^wizard\./))
  const workflowId = wizardIdx > 0 ? parts[wizardIdx - 1] : null
  if (workflowId) {
    WIZARD_REGISTRY[workflowId] = factory
    console.log(`[WizardRegistry] Auto-discovered: ${workflowId}`)
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

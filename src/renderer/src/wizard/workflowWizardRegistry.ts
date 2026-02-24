import { WizardStepConfig } from './WizardStepTypes'
import { tiktokRepostSteps } from './workflows/tiktok-repost.wizard'
import { uploadLocalSteps } from './workflows/upload-local.wizard'

/**
 * Registry: maps workflow_id → custom wizard steps.
 * To add a new workflow wizard, create a file in ./workflows/ and add it here.
 */
export const workflowWizardRegistry: Record<string, WizardStepConfig[]> = {
  'tiktok-repost': tiktokRepostSteps,
  'upload-local': uploadLocalSteps,
}

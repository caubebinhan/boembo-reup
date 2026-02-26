import type { WorkflowTroubleshootingProvider } from '@main/services/troubleshooting/types'
import { uploadLocalV1Cases } from './cases'

export const troubleshootingProvider: WorkflowTroubleshootingProvider = {
  workflowId: 'upload-local',
  workflowVersion: '1.0',
  cases: uploadLocalV1Cases,
}


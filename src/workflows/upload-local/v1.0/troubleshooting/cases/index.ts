import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'

const UPLOAD_LOCAL_V1 = { workflowId: 'upload-local', workflowVersion: '1.0' as const }

export const uploadLocalV1Cases: TroubleshootingCaseDefinition[] = [
  {
    id: 'upload-local-v1.workflow-smoke',
    title: 'Upload Local v1 Smoke (Planned)',
    description: 'Planned smoke case placeholder for upload-local@1.0. Add workflow-specific debug cases here.',
    risk: 'safe',
    category: 'smoke',
    level: 'basic',
    implemented: false,
    ...UPLOAD_LOCAL_V1,
  },
]


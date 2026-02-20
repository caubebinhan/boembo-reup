export type WizardSessionData = {
  id: string
  workflowId: string
  outputs: Record<string, any>
  currentStepIndex: number
}

// IPC Channels
export const IPC_CHANNELS = {
  WIZARD_START: 'wizard:start',
  WIZARD_GET_SESSION: 'wizard:get-session',
  WIZARD_COMMIT_STEP: 'wizard:commit-step',
  WIZARD_GO_BACK: 'wizard:go-back',

  CAMPAIGN_LIST: 'campaign:list',
  CAMPAIGN_GET: 'campaign:get',
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_DELETE: 'campaign:delete',

  CAMPAIGN_TRIGGER: 'trigger-campaign',
  CAMPAIGN_PAUSE: 'pause-campaign',
  CAMPAIGN_TOGGLE_STATUS: 'toggle-campaign-status',

  SCANNER_OPEN_WINDOW: 'open-scanner-window',
  SCANNER_IMPORT: 'scanner:import',

  FLOW_GET_PRESETS: 'flow:get-presets',
  FLOW_GET_UI_DESCRIPTOR: 'flow:get-ui-descriptor',
  NODES_CATALOG: 'nodes:catalog',

  ACCOUNT_LIST: 'account:list',
  ACCOUNT_ADD: 'account:add',

  PIPELINE_UPDATE: 'pipeline:update',
  PIPELINE_INTERACTION_WAITING: 'pipeline:interaction_waiting',
  PIPELINE_INTERACTION_RESOLVED: 'pipeline:interaction_resolved',
} as const

export type WizardSessionData = {
  id: string
  workflowId: string
  outputs: Record<string, any>
  currentStepIndex: number
}

// IPC Channels — single source of truth
// New channel strings should always be added here
export const IPC_CHANNELS = {
  // Wizard
  WIZARD_START: 'wizard:start',
  WIZARD_GET_SESSION: 'wizard:get-session',
  WIZARD_COMMIT_STEP: 'wizard:commit-step',
  WIZARD_GO_BACK: 'wizard:go-back',

  // Campaign CRUD & lifecycle
  CAMPAIGN_LIST: 'campaign:list',
  CAMPAIGN_GET: 'campaign:get',
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_DELETE: 'campaign:delete',
  CAMPAIGN_GET_JOBS: 'campaign:get-jobs',
  CAMPAIGN_GET_FLOW_NODES: 'campaign:get-flow-nodes',
  CAMPAIGN_TRIGGER: 'campaign:trigger',
  CAMPAIGN_PAUSE: 'campaign:pause',
  CAMPAIGN_RESUME: 'campaign:resume',
  CAMPAIGN_TOGGLE_STATUS: 'campaign:toggle-status',
  CAMPAIGN_UPDATE_PARAMS: 'campaign:update-params',
  CAMPAIGN_RESCHEDULE_ALL: 'campaign:reschedule-all',
  CAMPAIGN_DETAIL_OPEN: 'campaign-detail:open',
  CAMPAIGN_GET_VIDEOS: 'campaign:get-videos',
  CAMPAIGN_GET_ALERTS: 'campaign:get-alerts',
  CAMPAIGN_GET_LOGS: 'campaign:get-logs',
  CAMPAIGN_GET_NODE_PROGRESS: 'campaign:get-node-progress',
  CAMPAIGN_GET_VIDEO_EVENTS: 'campaign:get-video-events',
  CAMPAIGN_TRIGGER_EVENT: 'campaign:trigger-event',

  // Video operations
  VIDEO_RESCHEDULE: 'video:reschedule',
  VIDEO_SHOW_IN_EXPLORER: 'video:show-in-explorer',

  // Video editor
  VIDEO_EDIT_GET_PLUGIN_METAS: 'video-edit:get-plugin-metas',
  VIDEO_EDIT_GET_DEFAULTS: 'video-edit:get-defaults',
  VIDEO_EDIT_PREVIEW: 'video-edit:preview',
  VIDEO_EDITOR_OPEN: 'video-editor:open',
  VIDEO_EDITOR_DONE: 'video-editor:done',
  VIDEO_EDITOR_INIT_DATA: 'video-editor:init-data',

  // Scanner
  SCANNER_OPEN_WINDOW: 'scanner:open-window',
  SCANNER_IMPORT: 'scanner:import',

  // Flows & nodes
  FLOW_GET_PRESETS: 'flow:get-presets',
  FLOW_LIST: 'flow:list',
  FLOW_GET_UI_DESCRIPTOR: 'flow:get-ui-descriptor',
  NODES_CATALOG: 'nodes:catalog',

  // Account
  ACCOUNT_LIST: 'account:list',
  ACCOUNT_ADD: 'account:add',

  // Pipeline events (renderer <-> main)
  PIPELINE_UPDATE: 'pipeline:update',
  PIPELINE_INTERACTION_WAITING: 'pipeline:interaction_waiting',
  PIPELINE_INTERACTION_RESOLVED: 'pipeline:interaction_resolved',
  CAMPAIGNS_UPDATED: 'campaigns-updated',

  // Dialog
  DIALOG_OPEN_FILE: 'dialog:open-file',

  // Settings
  SETTINGS_GET_AUTOMATION_BROWSER: 'settings:get-automation-browser',
  SETTINGS_SET_AUTOMATION_BROWSER: 'settings:set-automation-browser',
  SETTINGS_GET_MEDIA_PATH: 'settings:get-media-path',
  SETTINGS_SET_MEDIA_PATH: 'settings:set-media-path',
  SETTINGS_BROWSE_FOLDER: 'settings:browse-folder',
  SETTINGS_DB_INFO: 'settings:db-info',
  SETTINGS_CLEAN_SCHEMA: 'settings:clean-schema',
  SETTINGS_INSPECT_SCHEMA: 'settings:inspect-schema',
  SETTINGS_GET_ENABLED_PLUGINS: 'settings:get-enabled-plugins',
  SETTINGS_SET_ENABLED_PLUGINS: 'settings:set-enabled-plugins',
  SETTINGS_SENTRY_OAUTH_STATUS: 'settings:sentry-oauth-status',
  SETTINGS_SENTRY_OAUTH_START: 'settings:sentry-oauth-start',
  SETTINGS_SENTRY_OAUTH_POLL: 'settings:sentry-oauth-poll',
  SETTINGS_SENTRY_OAUTH_DISCONNECT: 'settings:sentry-oauth-disconnect',
  BROWSER_SCAN_LOCAL: 'browser:scan-local',

  // Healthcheck
  HEALTHCHECK_NETWORK: 'healthcheck:network',
  HEALTHCHECK_STORAGE: 'healthcheck:storage',
  HEALTHCHECK_SERVICES: 'healthcheck:services',

  // Shell
  SHELL_OPEN_PATH: 'shell:open-path',

  // Troubleshooting
  TROUBLESHOOTING_LIST_CASES: 'troubleshooting:list-cases',
  TROUBLESHOOTING_LIST_WORKFLOWS: 'troubleshooting:list-workflows',
  TROUBLESHOOTING_LIST_RUNS: 'troubleshooting:list-runs',
  TROUBLESHOOTING_CLEAR_RUNS: 'troubleshooting:clear-runs',
  TROUBLESHOOTING_SEND_TO_SENTRY: 'troubleshooting:send-run-to-sentry',
  TROUBLESHOOTING_RUN_CASE: 'troubleshooting:run-case',
} as const

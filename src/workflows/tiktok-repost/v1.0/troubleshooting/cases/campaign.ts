import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

export const campaignCases: TroubleshootingCaseDefinition[] = [
  ttCase({
    id: 'tiktok-repost-v1.campaign.create-smoke',
    title: 'Campaign Create Smoke',
    description: 'Create campaign for tiktok-repost@1.0 and verify workflow_id/workflow_version/flow_snapshot persisted.',
    risk: 'safe',
    category: 'campaign',
    group: 'campaign',
    tags: ['campaign', 'create', 'db', 'flow-snapshot'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'workflowId', value: 'tiktok-repost' },
        { key: 'workflowVersion', value: '1.0' },
        { key: 'fixtureMode', value: 'create-minimal-campaign' },
      ],
      checks: {
        db: [
          'campaigns.data_json stores workflow_id=tiktok-repost',
          'campaigns.data_json stores workflow_version=1.0',
          'flow_snapshot is frozen and non-null for new campaign',
          'counters + meta initialized to defaults',
        ],
        ui: ['Campaign appears in list and opens detail page'],
        logs: ['Creation path and persisted campaign id are logged'],
      },
      passMessages: ['Campaign created and persisted with correct versioned flow snapshot'],
      errorMessages: ['Schema/persistence mismatch includes exact missing field names'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.campaign.detail-ui-open-snapshot',
    title: 'Campaign Detail UI Open Snapshot',
    description: 'Open newly created campaign detail and capture UI snapshot to verify version badge, counters, and empty-state sections.',
    risk: 'safe',
    category: 'campaign',
    group: 'campaign',
    tags: ['campaign', 'ui', 'detail', 'artifact:screenshot'],
    level: 'basic',
    implemented: true,
    meta: meta({
      parameters: [
        { key: 'fixtureCampaign', value: 'newly-created tiktok-repost@1.0 campaign' },
        { key: 'captureViewport', value: 'desktop', description: 'Initial screenshot viewport' },
      ],
      checks: {
        db: ['Campaign document exists before opening UI'],
        ui: ['Detail page renders workflow/version information', 'Counters/empty states render without crash'],
        logs: ['UI open route + campaign id logged by troubleshooting runner'],
        files: ['Capture screenshot of campaign detail initial state'],
      },
      passMessages: ['UI baseline snapshot can be compared for future regressions'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.campaign.trigger-pause-resume',
    title: 'Campaign Trigger / Pause / Resume',
    description: 'Trigger campaign, pause, resume, and verify jobs/campaign status transitions stay consistent.',
    risk: 'safe',
    category: 'campaign',
    group: 'campaign',
    tags: ['campaign', 'jobs', 'pause', 'resume', 'engine'],
    level: 'intermediate',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureCampaignState', value: 'ready-to-trigger' },
        { key: 'actions', value: 'trigger→pause→resume' },
      ],
      checks: {
        db: [
          'campaign status transitions active→paused→active (or finished) are persisted',
          'jobs rows created for start nodes',
          'No duplicate pending jobs created on resume when jobs already exist',
        ],
        logs: ['FlowEngine campaign events emitted in correct order'],
        events: ['campaign:triggered / campaign:paused / campaign:resumed emitted'],
      },
      errorMessages: ['Resume/trigger race or duplicate jobs are explicit in logs'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.loop.resume-last-processed-index',
    title: 'Loop Resume from last_processed_index',
    description: 'Simulate interruption and verify loop resumes exactly from persisted last_processed_index.',
    risk: 'safe',
    category: 'campaign',
    group: 'campaign',
    tags: ['loop', 'resume', 'last_processed_index', 'recovery'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureVideosCount', value: 5 },
        { key: 'interruptionAfterIndex', value: 2 },
      ],
      checks: {
        db: [
          'campaign.last_processed_index persisted before interruption',
          'Resume starts at exact saved index (no duplicate processing, no skipped items)',
          'Final last_processed_index reaches total item count',
        ],
        logs: ['Loop iteration logs show resume offset and subsequent progression'],
      },
      passMessages: ['Resume behavior is idempotent and index-accurate'],
    }),
  }),
  ttCase({
    id: 'tiktok-repost-v1.campaign.concurrent-save-race-smoke',
    title: 'Campaign Concurrent Save Race Smoke',
    description: 'Simulate flow update + troubleshooting patch update close together and verify no obvious campaign document corruption.',
    risk: 'safe',
    category: 'campaign',
    group: 'campaign',
    tags: ['campaign', 'db', 'race', 'edge'],
    level: 'advanced',
    implemented: false,
    meta: meta({
      parameters: [
        { key: 'fixtureRaceWrites', value: 'video status patch + metadata update' },
        { key: 'repeat', value: 5, description: 'Loop attempts to increase collision probability' },
      ],
      checks: {
        db: [
          'Campaign data_json remains valid JSON and reloadable after concurrent-ish writes',
          'Unrelated videos/alerts/meta fields are not accidentally dropped',
        ],
        logs: ['Before/after campaign snapshots or diffs are logged for failed assertions'],
      },
      errorMessages: ['Lost-update symptoms include exact field diffs in logs'],
      notes: ['Useful regression check once async task handlers start patching campaigns in background.'],
    }),
  }),
]

# Boembo Developer Guide

## Architecture Overview

```
src/
 core/                    # Framework: engine, registries, contracts (NO workflow logic)
   engine/
     FlowEngine.ts    # Executes workflows: job polling, node execution, loop handling
     ExecutionLogger.ts # Logs all events to DB + emits to renderer
     PipelineEventBus.ts # EventEmitter singleton for inter-module events
   flow/
     FlowLoader.ts    # Loads flow.yaml files, parses into FlowDefinition
     ExecutionContracts.ts # TypeScript interfaces for flows, nodes, edges
   nodes/
       NodeDefinition.ts # Core types: NodeManifest, NodeConfigSchema, NodeExecutionContext
       NodeRegistry.ts  # Global node registry (auto-populated)
       NodeHelpers.ts   # Shared error handling: failGracefully, failBatchGracefully, setVideoStatus, isNetworkError, isDiskError
 nodes/                   # Node implementations (auto-discovered via import.meta.glob)
   _shared/
     timeWindow.ts    # Shared time-window utilities (normalizeTimeRanges, nextValidSlot)
   index.ts             # Auto-discovery barrel - scans ./**/index.ts, registers all nodes
   tiktok-scanner/      # Each node = folder with manifest.ts + backend.ts + index.ts
   video-scheduler/
   caption-generator/   # Generates captions from template (captionTemplate, removeHashtags, appendTags)
   tiktok-account-dedup/ # Per-account duplicate detection before publish (publish_history)
   tiktok-publisher/
   ... (16 nodes total)
 workflows/               # Versioned workflow packages (auto-discovered)
   tiktok-repost/
     v1.0/
       flow.yaml        # Pipeline definition (latest version cached by FlowLoader)
       recovery.ts      # Workflow-specific crash recovery logic (main)
       ipc.ts           # Workflow-specific IPC handlers (main)
       events.ts        # Workflow-specific event listeners (main)
       wizard.ts        # Wizard step configuration (renderer-side)
       card.tsx         # Campaign card component (renderer-side)
       detail.tsx       # Campaign detail view (renderer-side)
 shared/
   ipc-types.ts         # IPC channel constants + WizardSessionData type
 renderer/src/            # React frontend
   store/               # Redux Toolkit store
     campaignsSlice.ts
     pipelineSlice.ts
     nodeEventsSlice.ts
     interactionSlice.ts
   components/
     SplashScreen.tsx   # App startup: branding + sequential health checks (DB, schema, storage, workflow services)
     wizard/            # Shared wizard step components
   detail/shared/
       PipelineVisualizer.tsx # Campaign pipeline visualization + InspectPanel
 preload/
   index.ts             # Exposes window.api { invoke, on, removeAllListeners }
 main/                    # Electron main process
     index.ts             # App entry: initDb, CrashRecovery, FlowLoader, FlowEngine, IPC setup
     services/
       CrashRecovery.ts           # On-startup: reset stuck jobs, delegate to per-workflow handlers
       ServiceHealthMonitor.ts    # Background service: periodic workflow URL pings, auto-pause on outage
       PublishAccountService.ts   # TikTok account management via BrowserWindow login
       BrowserService.ts          # Playwright browser pooling
       BrowserProfileScannerService.ts # Scan existing browser profiles
       AppSettingsService.ts      # Key-value settings in app_settings table
       TroubleshootingService.ts
     utils/
       diskSpace.ts               # Cross-platform disk space check (Windows PowerShell/wmic + macOS/Linux df)
     ipc/                 # IPC handlers (campaigns, scanner, wizard, settings, troubleshooting)
     tiktok/              # TikTok-specific modules (publisher, scanner)
     db/                  # SQLite database
         Database.ts      # Schema initialization (document-store)
         models/          # TypeScript interfaces: Campaign, Job, Account, PublishHistory
         repositories/    # BaseRepo + CampaignRepo, JobRepo, PublishHistoryRepo, etc.
```

> Workflow auto-discovery in `src/workflows/index.ts` is **main-process only** and scans versioned modules (`src/workflows/*/v*/recovery.ts`, `ipc.ts`, `services.ts`, `events.ts`) so multiple workflow versions can coexist.
>
> Renderer UI auto-discovery is separate:
> `workflowWizardRegistry.ts` scans `src/workflows/*/v*/wizard.{ts,tsx}` (latest discovered version wins for new campaign creation),
> `CampaignCard.tsx` scans `src/workflows/*/v*/card.tsx` (latest wins),
> and `WorkflowDetailRegistry.ts` scans `src/workflows/*/v*/detail.tsx` (version-aware using `campaign.workflow_version`, fallback to latest).

---

## Core Interfaces

### `NodeDefinition` - The Node Contract

```typescript
// src/core/nodes/NodeDefinition.ts

interface NodeConfigSchemaField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select' | 'account_picker'
  required?: boolean
  default?: any
  options?: Array<{ value: string; label: string }>
  description?: string
}

interface NodeConfigSchema {
  fields: NodeConfigSchemaField[]
}

interface NodeExecutionContext {
  campaign_id: string
  job_id?: string
  params: Record<string, any>          // Effective runtime params (campaign params + inline node params)
  logger: { info(msg: string): void; error(msg: string, err?: any): void }
  onProgress(msg: string): void        // Shows status in PipelineVisualizer
}

interface NodeExecutionResult {
  data: any                            // Passed as input to the next node
  action?: 'continue' | 'recall' | 'finish'
  recall_target?: string               // instance_id to jump back to (if action='recall')
  message?: string                     // Human-readable log message
}

interface NodeManifest {
  id: string                           // e.g. 'tiktok.scanner', 'core.video_scheduler'
  name: string
  category: 'source' | 'filter' | 'transform' | 'publish' | 'control'
  icon?: string
  description?: string
  config_schema?: NodeConfigSchema     // Used by wizard auto-generation
  editable_settings?: NodeConfigSchema // Editable in visualizer InspectPanel
  on_save_event?: string               // Event triggered on save (e.g. 'reschedule')
}

interface NodeDefinition {
  manifest: NodeManifest
  execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult>
}
```

### `FlowDefinition` - The Workflow Contract

```typescript
// src/core/flow/ExecutionContracts.ts

interface FlowDefinition {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  version: string
  nodes: FlowNodeDefinition[]
  edges: FlowEdgeDefinition[]
  ui?: WorkflowUIDescriptor
  health_checks?: Array<{ name: string; url: string }>  // Service endpoints checked at startup + pre-run
}

interface FlowNodeDefinition {
  node_id: string                      // References NodeManifest.id
  instance_id: string                  // Unique within this flow (e.g. 'scanner_1')
  params?: Record<string, any>         // Inline node-level params merged into ctx.params by FlowEngine
  children?: string[]                  // Only for loop nodes - child instance_ids
  on_error?: 'skip' | 'stop_campaign' | 'retry'
  timeout?: number                     // Node-level timeout in ms
  events?: Record<string, { action: 'skip_item' | 'pause_campaign' | 'stop_campaign'; emit?: string }>
  execution?: any                      // Runtime state (populated by engine)
}

interface FlowEdgeDefinition {
  from: string                         // instance_id
  to: string                          // instance_id
  when?: string                        // JS expression evaluated against result.data
}
```

---

## Database Schema

All domain data is stored as JSON documents (`data_json` column). Only fields needed for cross-document SQL queries are denormalized as indexed columns.

### `campaigns` table
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | Random 8-char hex ID |
| `data_json` | TEXT (JSON) | Full `CampaignDocument` includes `name`, `workflow_id`, `workflow_version`, `status`, `params`, `videos[]`, `alerts[]`, `counters`, `meta`, `last_processed_index`, `flow_snapshot` |
| `created_at` / `updated_at` | INTEGER | Unix timestamps (denormalized for sorting) |

**`CampaignDocument` structure** (embedded in `data_json`):
```typescript
{
  id, name, workflow_id, workflow_version, status,
  params: Record<string, any>,      // All wizard settings single source of truth
  flow_snapshot: FlowDefinition,    // Frozen flow at creation time
  videos: VideoRecord[],            // All videos: { platform_id, status, local_path, publish_url, data, scheduled_for, queue_index }
  alerts: AlertRecord[],            // Workflow alerts: { level, title, body, created_at }
  counters: { queued, downloaded, published, failed },
  last_processed_index: number,     // Loop resume checkpoint
  meta: Record<string, any>,        // Schemaless workflow-specific runtime state
}
```

> Videos are **NOT** a separate table they live inside `campaigns.data_json` as `VideoRecord[]`.
> Access via `CampaignStore.videos`, `CampaignStore.findVideo(platformId)`, `CampaignStore.updateVideo(...)`, etc.

### `jobs` table
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `data_json` | TEXT (JSON) | Full `JobDocument` (`workflow_id`, `node_id`, `instance_id`, `type`, `status`, `error_message`, timestamps, node input data, etc.) |
| `status` | TEXT | Denormalized index for polling: `pending` / `running` / `completed` / `failed` |
| `campaign_id` | TEXT | Denormalized index for campaign queries |
| `scheduled_at` | INTEGER | Denormalized index for scheduler polling |
| `created_at` / `updated_at` | INTEGER | Denormalized timestamps for sorting/updates |

### `execution_logs` table
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `campaign_id` | TEXT | FK to campaigns |
| `job_id` / `instance_id` / `node_id` | TEXT | Which node produced this log |
| `level` | TEXT | `info` / `warn` / `error` / `debug` / `progress` |
| `event` | TEXT | Structured event name (e.g. `node:start`, `node:end`, `node:error`) |
| `message` | TEXT | Human-readable message |
| `data_json` | TEXT (JSON) | Additional structured data |

### `publish_accounts` table
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `data_json` | TEXT (JSON) | Account data: `username`, `handle`, `avatar`, `cookies`, `proxy`, `session_status`, etc. |
| `created_at` / `updated_at` | INTEGER |

### `publish_history` table
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `data_json` | TEXT (JSON) | Full history record |
| `account_id` | TEXT | Indexed for dedup queries |
| `source_platform_id` | TEXT | Indexed source video ID |
| `file_fingerprint` | TEXT | Indexed file-level dedup |
| `status` | TEXT | `published` / `under_review` / `duplicate` |
| `created_at` / `updated_at` | INTEGER |

### `app_settings` table
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | Setting key |
| `data_json` | TEXT | JSON-encoded value |
| `updated_at` | INTEGER | Unix timestamp |

> Used by `SettingsRepo` / `AppSettingsService` for global key-value app settings.

---

## Campaign Parameters (Source of Truth)

All backend nodes receive these via `ctx.params`. **Use these exact names never create aliases.**

| Parameter | Type | Set By | Purpose |
|---|---|---|---|
| `name` | `string` | Step1 | Campaign display name |
| `captionTemplate` | `string` | Step1 | Caption template with `[Original Desc]`, `[Author]`, `[Tags]` |
| `removeHashtags` | `boolean` | Step1 | Strip hashtags from original caption |
| `appendTags` | `string` | Step1 | Tags to append to caption |
| `intervalMinutes` | `number` | Step4 | **Gap (minutes) between videos.** Default: `60` |
| `timeRanges` | `TimeRange[]` | Step4 | Active time windows for scheduling |
| `sources` | `Source[]` | Step2 | TikTok channels/keywords to scan (per-source config includes `historyLimit`, `sortOrder`, `timeRange`, `startDate`, `endDate`) |
| `selectedAccounts` | `string[]` | Step5 | Publish account IDs (round-robin) |
| `privacy` | `string` | Step5 | TikTok privacy setting. Default: `'public'` |

### TimeRange shape

```typescript
interface TimeRange {
  days: number[]   // 0=Sun, 1=Mon ... 6=Sat
  start: string    // "HH:mm"
  end: string      // "HH:mm"
}
```

**Priority order:** `timeRanges` (if set) 24/7 fallback.
Use `normalizeTimeRanges(ctx.params)` from `nodes/_shared/timeWindow.ts`.

---

## IPC Communication

### Preload Bridge

```typescript
// Renderer uses: window.api.invoke(channel, data?)  for request/response
//                window.api.on(channel, callback)    for push events from main
```

### IPC Channels (Request/Response `ipcMain.handle`)

| Channel | Direction | Handler File | Description |
|---|---|---|---|
| `wizard:start` | renderer -> main | `ipc/wizard.ts` | Start wizard session |
| `wizard:get-session` | renderer -> main | `ipc/wizard.ts` | Get current wizard session |
| `wizard:commit-step` | renderer -> main | `ipc/wizard.ts` | Save wizard step data |
| `wizard:go-back` | renderer -> main | `ipc/wizard.ts` | Go to previous wizard step |
| `campaign:list` | renderer -> main | `ipc/campaigns.ts` | List all campaigns |
| `campaign:get` | renderer -> main | `ipc/campaigns.ts` | Get single campaign by ID |
| `campaign:create` | renderer -> main | `ipc/campaigns.ts` | Create campaign from wizard |
| `campaign:delete` | renderer -> main | `ipc/campaigns.ts` | Delete campaign + logs |
| `campaign:trigger` | renderer -> main | `ipc/campaigns.ts` | Start/run campaign |
| `campaign:pause` | renderer -> main | `ipc/campaigns.ts` | Pause campaign |
| `campaign:resume` | renderer -> main | `ipc/campaigns.ts` | Resume campaign |
| `campaign:get-jobs` | renderer -> main | `ipc/campaigns.ts` | Get jobs for campaign |
| `campaign:get-flow-nodes` | renderer -> main | `ipc/campaigns.ts` | Get flow definition + `editable_settings` |
| `campaign:get-logs` | renderer -> main | `ipc/campaigns.ts` | Get execution logs (limit optional) |
| `campaign:get-videos` | renderer -> main | `workflows/tiktok-repost/v1.0/ipc.ts` | Get videos for campaign (ordered by queue_index) |
| `campaign:get-alerts` | renderer -> main | `workflows/tiktok-repost/v1.0/ipc.ts` | Get workflow alerts for campaign |
| `campaign:get-node-progress` | renderer -> main | `ipc/campaigns.ts` | Get latest progress message per node instance |
| `campaign:update-params` | renderer -> main | `ipc/campaigns.ts` | Merge params into campaign |
| `campaign:reschedule-all` | renderer -> main | `workflows/tiktok-repost/v1.0/ipc.ts` | Recalculate all queued video times |
| `toggle-campaign-status` | renderer -> main | `ipc/campaigns.ts` | Toggle active/paused |
| `flow:get-presets` | renderer -> main | `ipc/campaigns.ts` | List available workflows (with node tags) |
| `flow:list` | renderer -> main | `ipc/campaigns.ts` | List workflows (minimal fields) |
| `flow:get-ui-descriptor` | renderer -> main | `ipc/campaigns.ts` | Get workflow UI config |
| `open-scanner-window` | renderer -> main | `ipc/scanner.ts` | Open TikTok scanner popup |
| `video:reschedule` | renderer -> main | `workflows/tiktok-repost/v1.0/ipc.ts` | Reschedule single video |
| `video:show-in-explorer` | renderer -> main | `workflows/tiktok-repost/v1.0/ipc.ts` | Open file in system explorer |
| `account:list` | renderer -> main | `ipc/settings.ts` | List publish accounts |
| `account:add` | renderer -> main | `ipc/settings.ts` | Add TikTok account via login |
| `healthcheck:network` | renderer -> main | `ipc/settings.ts` | Ping TikTok (splash screen) |
| `healthcheck:storage` | renderer -> main | `ipc/settings.ts` | Check free disk space (cross-platform) |
| `healthcheck:services` | renderer -> main | `ipc/settings.ts` | Check all workflow-declared service URLs |
| `shell:open-path` | renderer -> main | `ipc/settings.ts` | Open path in system file explorer |
| `nodes:catalog` | renderer -> main | `ipc/campaigns.ts`? | (defined in IPC_CHANNELS, not yet implemented) |

> Workflow-specific request/response channels can also be registered from `src/workflows/*/v*/ipc.ts` via the workflow auto-discovery barrel.

### Push Events (Main -> Renderer via `webContents.send`)

| Event | Emitted By | Payload | Listener |
|---|---|---|---|
| `execution:log` | `ExecutionLogger.log()` | `LogEntry` full | Log viewer |
| `node:status` | `ExecutionLogger.nodeStart/End/Error` | `{ campaignId, instanceId, status, error? }` | `nodeEventsSlice.updateNodeStatus` |
| `node:progress` | `ExecutionLogger.nodeProgress` | `{ campaignId, instanceId, message }` | `nodeEventsSlice.updateNodeProgress` |
| `execution:node-data` | `ExecutionLogger.nodeData` | `{ campaignId, instanceId, data }` | Detail views |
| `node:event` | `ExecutionLogger.emitNodeEvent` | `{ campaignId, instanceId, event, data }` | Workflow `events.ts` listeners + custom UI/reactive handling |
| `pipeline:interaction_waiting` | `PipelineEventBus` | session payload | `interactionSlice` |
| `pipeline:interaction_resolved` | `PipelineEventBus` | session payload | `interactionSlice` |
| `campaign:created` | `campaigns.ts` | campaign object | Campaign list refresh |
| `campaigns-updated` | Various | - | Global campaign list refresh |
| `campaign:params-updated` | `campaigns.ts` | `{ id, params }` | Visualizer settings refresh |
| `campaign:healthcheck-failed` | `FlowEngine` | `{ campaign_id, errors[], message }` | Toast + campaign card alert |
| `service:health` | `ServiceHealthMonitor` | `{ event, service, ok, error, message }` | Service status changes |
| `scanner:import` | `scanner.ts` | source data | Wizard step 2 |

---

## Execution Flow

```mermaid
graph TD
    A[User creates campaign via Wizard] --> B[campaign:create IPC DB]
    B --> C[User clicks Run campaign:trigger]
    C --> D[FlowEngine.triggerCampaign]
    D --> E[Resolve flow (snapshot/latest), find start nodes]
    E --> F[Create Job for each start node DB]
    F --> G[FlowEngine.tick polls every 5s]
    G --> H{Job type?}
    H -- Regular --> I[Execute node get result]
    H -- Loop --> J[Execute loop iterate items]
    I --> K{result.action?}
    K -- continue --> L[Follow edges create next jobs]
    K -- finish --> M[Set campaign = 'finished']
    K -- recall --> N[Jump back to recall_target]
    J --> O[For each item: run children pipeline]
    O --> P[Save last_processed_index for resume]
```

### Loop Execution Detail

```
for each item in items (starting from last_processed_index):
  1. Check campaign status (paused? return)
  2. For each child node:
     a. If item was skipped only run timeout/condition
     b. Execute node with current data
     c. Handle result:
        - action='finish' stop campaign
        - action='continue' + no data mark skipped
        - Otherwise pass data to next child
     d. On error:
        - match `events:` handler (loop child only) -> execute action (skip_item/pause_campaign/stop_campaign), optional `emit`
        - then apply `on_error` fallback (`stop_campaign` or skip item)
  3. Save progress: UPDATE campaigns SET last_processed_index = i+1
```

### Crash Recovery (on app startup)

The recovery system is **two-tier**:

1. **Generic** (`CrashRecovery.ts`): Resets all `running` jobs to `pending`.
2. **Per-workflow** (`workflows/*/v*/recovery.ts`): Each workflow version can register a `recover(campaignId)` handler via `CrashRecoveryService.registerRecovery(workflowId, { recover })`.

#### `tiktok-repost` recovery (`src/workflows/tiktok-repost/v1.0/recovery.ts`):
```
1. Find queued videos with scheduled_for < NOW reschedule from now
2. Find under_review videos reset to 'queued' (publisher will resume verification)
3. If no pending/running jobs re-trigger campaign from start
```

> To add recovery for a new workflow version: create `src/workflows/my-workflow/v1.0/recovery.ts` exporting `recover(campaignId)`, and register it on startup.

---

## How to Write a Node

Most nodes are self-contained folders under `src/nodes/` and are auto-discovered at runtime.
(`core.loop` is a FlowEngine built-in special case, not a folder in `src/nodes`.)

```
src/nodes/my-node/
 manifest.ts    # Node metadata
 backend.ts     # Execution logic
 index.ts       # Entry: imports both, exports { manifest, execute } as NodeDefinition
```

### manifest.ts

```typescript
import { NodeManifest } from '../../core/nodes/NodeDefinition'

const manifest: NodeManifest = {
  id: 'my-namespace.my_node',
  name: 'My Node',
  category: 'transform',
  icon: '',
  description: 'What this node does',
  // Optional: editable in visualizer
  editable_settings: {
    fields: [
      { key: 'myParam', label: 'My Param', type: 'number', default: 10 }
    ]
  },
  on_save_event: 'reschedule' // Optional: IPC event on save
}
export default manifest
```

### backend.ts

```typescript
import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  ctx.onProgress('Processing...')
  ctx.logger.info('Started processing')

  // Use ONLY canonical ctx.params names - NEVER create fallbacks
  const myParam = ctx.params.myParam ?? 10

  return {
    data: input,         // Passed as input to next node
    action: 'continue',  // 'continue' | 'finish' | 'recall'
    message: 'Done',
  }
}
```

### Key Rules

- **Use only canonical `ctx.params` names.** Never add `?? ctx.params.some_legacy_alias` this causes drift.
- **Return `{ data: null }`** to signal skip (e.g. dedup detected duplicate).
- **Throw errors** for hard failures. In the current FlowEngine, `on_error` handling is applied to loop child nodes; non-loop node failures mark the job as failed.
- **Use `ctx.logger`**, not `console.log`. Logs go to DB + show in execution log UI.
- **Use `ctx.onProgress(msg)`** for live status in PipelineVisualizer.

---

## How to Write a Workflow

```
src/workflows/my-workflow/
`-- v1.0/
    |-- flow.yaml        # Required: pipeline definition
    |-- recovery.ts      # Optional: crash recovery handler (main auto-load)
    |-- ipc.ts           # Optional: workflow-specific IPC handlers (main auto-load)
    |-- services.ts      # Optional: workflow-specific service setup (main auto-load)
    |-- events.ts        # Optional: workflow-specific event listeners (main auto-load)
    |-- wizard.tsx       # Optional: wizard step config (renderer auto-discovery)
    |-- card.tsx         # Optional: campaign list card (renderer auto-discovery)
    `-- detail.tsx       # Optional: campaign detail view (renderer auto-discovery)
```

### flow.yaml Structure

```yaml
id: my-workflow
name: My Workflow
icon: 
color: "#8b5cf6"
version: "1.0"

# Service endpoints this workflow depends on — checked at startup + before campaign run
health_checks:
  - name: TikTok
    url: https://www.tiktok.com
  - name: TikTok Studio
    url: https://www.tiktok.com/tiktokstudio

nodes:
  - node_id: tiktok.scanner
    instance_id: scanner_1
    timeout: 30000            # Optional: timeout in ms

  - node_id: core.video_scheduler
    instance_id: scheduler_1

  # Loop node runs children for each item
  - node_id: core.loop
    instance_id: video_loop
    children: [check_time_1, dedup_1, downloader_1, caption_1, account_dedup_1, publisher_1]

  - node_id: core.check_in_time
    instance_id: check_time_1

  - node_id: core.caption_gen
    instance_id: caption_1

  - node_id: tiktok.account_dedup
    instance_id: account_dedup_1

  - node_id: tiktok.publisher
    instance_id: publisher_1
    on_error: skip            # Applied for loop children in current FlowEngine
    events:                   # Optional: loop-child error handlers (matched against thrown error message)
      timeout:exceeded:
        action: pause_campaign
        emit: publisher:timeout

  # Inline node params are parsed and merged into ctx.params (node params override campaign params)
  - node_id: core.condition
    instance_id: cond_violation_1
    params:
      expression: "status === 'violation'"

edges:
  - from: scanner_1
    to: scheduler_1
  - from: scheduler_1
    to: video_loop
  - from: publisher_1
    to: cond_violation_1
  - from: cond_violation_1
    to: scheduler_1
    when: "branch === 'true'"   # JS expression against result.data
```

> Current runtime note: `FlowLoader` parses `params`, `on_error`, `timeout`, and `events`. `FlowEngine` merges node-level `params` into `ctx.params` (node params override campaign params) and executes `flow.yaml` `events` handlers for **loop-child thrown errors** using substring matching on the error message.

---

## Built-in Nodes Reference

| Node ID | Category | Purpose | Reads from `ctx.params` |
|---|---|---|---|
| `tiktok.scanner` | source | Scan TikTok channels/keywords | `sources`, `campaignType` |
| `core.video_scheduler` | control | Assign `scheduled_for` timestamps | `intervalMinutes`, `timeRanges` |
| `core.check_in_time` | control | Wait for active hours + scheduled time | `timeRanges` (via `normalizeTimeRanges`) |
| `core.deduplicator` | filter | Skip already-processed videos (by platform_id) | |
| `core.downloader` | transform | Download video to local disk | |
| `core.caption_gen` | transform | Generate caption from template | `captionTemplate`, `removeHashtags`, `appendTags` |
| `tiktok.account_dedup` | filter | Per-account duplicate check via publish_history (exact + AV similarity) | |
| `tiktok.publisher` | publish | Publish video to TikTok | `selectedAccounts`, `privacy` |
| `core.timeout` | control | Wait N minutes between videos | `intervalMinutes`, `enableJitter` |
| `core.limit` | filter | Limit number of items | `maxVideos` |
| `core.condition` | control | Branch on expression | `expression` (supports inline node `params` via merged `ctx.params`) |
| `core.js_runner` | transform | Execute custom JavaScript transform | `code` |
| `core.campaign_finish` | control | Mark campaign complete | |
| `core.quality_filter` | filter | Filter by quality criteria | |
| `core.loop` | control | Iterate over items array, run children per item (FlowEngine special-case; no `src/nodes` manifest) | - |
| `core.file_source` | source | Load videos from local files | - |

> **Note:** `tiktok-repost` (`v1.0`) loop child order is:
> `check_time_1` -> `dedup_1` -> `downloader_1` -> `caption_1` -> `account_dedup_1` -> `publisher_1`
>
> After loop completion, it branches via `cond_mode_check_1` to `monitor_1` or `finish_1`. Desktop notifications are handled by `src/workflows/tiktok-repost/v1.0/events.ts` (listening to `node:event`), not by `core.notify` nodes in YAML.

---

## Redux Store (Renderer)

| Slice | State Shape | Purpose |
|---|---|---|
| `campaigns` | Campaign list + current | Campaign CRUD state |
| `pipeline` | `tasks: Record<id, VideoTask>` | Video-level status tracking |
| `nodeEvents` | `activeNodes`, `nodeProgress`, `byCampaign` | Real-time node execution status from IPC |
| `interaction` | Interaction session data | CAPTCHA/dialog handling |

### Key interfaces in `nodeEventsSlice`:

```typescript
interface ActiveNodeInfo {
  status: 'running' | 'completed' | 'failed'
  message?: string
  jobId?: string
  error?: string
  updatedAt: number
}

interface NodeStat {
  instance_id: string
  pending: number; running: number; completed: number; failed: number; total: number
  lastStatus?: string; lastError?: string
}

interface JobSummary {
  id: string; campaign_id: string; workflow_id: string
  node_id: string; instance_id: string; type: string; status: string
  data_json: string; error_message?: string
  scheduled_at?: number; started_at?: number; completed_at?: number
}
```

---

## Error Handling

### Shared Error Helpers (`@core/nodes/NodeHelpers`)

| Helper | Use Case | Behavior |
|---|---|---|
| `failGracefully(ctx, instanceId, platformId, errorType, msg)` | Per-video node errors | Sets video status to 'failed', emits event, returns `{ action: 'continue', data: null }` |
| `failBatchGracefully(ctx, instanceId, errorType, msg)` | Source/batch node errors | Emits event, returns `{ action: 'continue', data: [] }` |
| `setVideoStatus(ctx, platformId, status)` | DRY status updater | Updates video doc + increments counter |
| `isNetworkError(msg)` | Detect connectivity issues | Matches ENOTFOUND, ECONNREFUSED, net::err_*, etc. |
| `isDiskError(msg)` | Detect storage issues | Matches ENOSPC, EROFS, EACCES, disk full, etc. |

### Per-Node `on_error` (in flow.yaml)
- `skip` *(default)*: Skip current item and continue loop (applies to loop child nodes in current `FlowEngine`)
- `stop_campaign`: Set campaign status to `'error'`, halt loop execution
- `retry`: Declared in the type contract, but not implemented by the current `FlowEngine`

### Per-Node `events` (in `flow.yaml`)
- Supported shape: `events: { "<event-key>": { action, emit? } }`
- Current runtime scope: evaluated in the **loop child catch path** (when a child node throws)
- Matching strategy: substring match of thrown error message against all parts of the event key (e.g. `timeout:exceeded` matches `"Node timeout exceeded (...)"`)
- Actions:
  - `skip_item`: skip current item (continue loop; `on_error` fallback still applies afterward)
  - `pause_campaign`: set campaign status to `paused`, emit `campaign:paused`, stop loop
  - `stop_campaign`: set campaign status to `error`, emit `campaign:error`, stop loop
- `emit` behavior: emits a structured `node:event` via `ExecutionLogger.emitNodeEvent(...)` with `event = emit`

### Automatic Error Detection (FlowEngine)

FlowEngine detects critical errors in both `executeJob` and `executeLoop` catch blocks:

| Error Type | Detection | Action | Emit |
|---|---|---|---|
| **Network error** | `isNetworkError(msg)` | `campaign.status = 'paused'` | `campaign:network-error` + `campaign:healthcheck-failed` |
| **Disk error** | `isDiskError(msg)` | `campaign.status = 'error'` (fatal) | `campaign:disk-error` + `campaign:healthcheck-failed` |

> Network errors pause campaigns (recoverable). Disk errors fail campaigns (fatal — requires user intervention).

### Pre-Run Health Check

`FlowEngine.preRunHealthCheck(campaignId)` runs automatically before `triggerCampaign` and `resumeCampaign`:
1. **Storage check**: `getFreeDiskSpaceMB()` — blocks if < 100 MB free
2. **Workflow services**: Pings all URLs from `flow.yaml` `health_checks` — blocks if any unreachable

If any check fails → campaign status set to `'error'`, `campaign:healthcheck-failed` emitted to renderer for toast.

### Publisher-Specific Events
The publisher emits structured `node:event` logs/UI events (e.g. `captcha:detected`, `violation:detected`) and returns structured `data` statuses:
- `captcha`: emits `captcha:detected`, updates video status to `captcha`, returns `{ data: { ...video, status: 'captcha' } }`
- `violation`: emits `violation:detected`, updates video status to `violation`, returns `{ data: { ...video, status: 'violation' } }`
- `under_review`: enters retry loop (checking content dashboard for publish confirmation)
- `duplicate`: returns `{ data: null }` (loop item skipped)

### CAPTCHA Detection
`FlowEngine` does **not** currently auto-set `campaign.status = 'needs_captcha'` from publisher outcomes/errors. Current behavior relies on publisher `node:event` emissions (e.g. `captcha:detected`) and workflow-specific listeners (e.g. `src/workflows/tiktok-repost/v1.0/events.ts`) and/or `flow.yaml` `events` handlers if configured.

---

## Startup Sequence

```
app.whenReady() -> 
  1. initDb()                           # Create SQLite tables (IF NOT EXISTS)
  2. CrashRecoveryService.recoverPendingTasks()  # Fix stuck jobs, delegate to workflow handlers
  3. flowLoader.loadAll(workflowsDir)    # Scan + parse flow.yaml (incl. health_checks)
  4. flowEngine.start()                  # Begin 5s polling loop
  5. serviceHealthMonitor.start()        # Background URL pinger (60s interval)
  6. setup*IPC()                         # Register all IPC handlers
  7. createWindow()                      # Launch Electron BrowserWindow
  8. SplashScreen                        # Sequential health checks before app shows
```

The `import '../workflows'` barrel in `index.ts` auto-imports workflow main-process modules from versioned folders (`*/v*/recovery.ts`, `ipc.ts`, `services.ts`, `events.ts`) which register themselves (e.g. `CrashRecoveryService.registerRecovery(workflowId, { recover })`).

> **Note:** Node auto-discovery happens at import time (`import '../nodes'` in `index.ts`), which uses `import.meta.glob('./**/index.ts', { eager: true })` to find and register all 16 nodes.

---

## Service Health Monitor

`ServiceHealthMonitor` (`src/main/services/ServiceHealthMonitor.ts`) runs as a background singleton:

| Feature | Detail |
|---|---|
| **Interval** | Pings all workflow-declared URLs every 60s |
| **Threshold** | 2 consecutive failures → auto-pause affected campaigns |
| **Scope** | Only affects campaigns whose workflow declares the failing service |
| **Recovery** | Emits `service:recovered` event but does **not** auto-resume — user must resume manually |
| **Cross-platform** | Uses `electron.net.fetch` for pings, `diskSpace.ts` for storage |

### Cross-Platform Disk Space (`src/main/utils/diskSpace.ts`)

| Platform | Method |
|---|---|
| Windows | PowerShell `Get-PSDrive` (primary), `wmic` (fallback) |
| macOS/Linux | `df -k` |

Returns free space in MB, `-1` on error. Used by splash screen, pre-run health check, and storage IPC.

---

## Debug Case Hub

Troubleshooting case management is centralized under `tests/debug/`:

1. `tests/debug/CASE_INDEX.json` - machine-readable per-case index (id, status, fingerprint, todos)
2. `tests/debug/CASEBOOK.md` - implementation queue and workflow breakdown
3. `tests/debug/EXCEPTION_MATRIX.md` - proposed extra edge/exception scenarios
4. `tests/debug/artifacts/` - archived artifact bundles per run
5. `tests/debug/footprints/` - saved diagnostic footprint JSON per run

Regenerate casebook/index:

```bash
npm run debug:casebook
```

Troubleshooting run records now include:

- `caseFingerprint` + `runFingerprint`
- `artifactManifestPath` (artifact bundle manifest)
- `footprintPath` (saved footprint JSON path)

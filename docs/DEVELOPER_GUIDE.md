# Boembo Developer Guide

## Architecture Overview

```
src/
├── core/                    # Framework: engine, registries, contracts (NO workflow logic)
│   ├── engine/
│   │   ├── FlowEngine.ts    # Executes workflows: job polling, node execution, loop handling
│   │   ├── ExecutionLogger.ts # Logs all events to DB + emits to renderer
│   │   └── PipelineEventBus.ts
│   ├── flow/
│   │   ├── FlowLoader.ts    # Loads flow.yaml files, parses into FlowDefinition
│   │   └── ExecutionContracts.ts # TypeScript interfaces for flows, nodes, edges
│   └── nodes/
│       └── NodeRegistry.ts  # Global node registry (auto-populated)
├── nodes/                   # Node implementations (auto-discovered)
│   ├── _shared/
│   │   └── timeWindow.ts    # Shared time-window utilities (normalizeTimeRanges, nextValidSlot)
│   ├── tiktok-scanner/      # Each node = folder with manifest + backend
│   ├── video-scheduler/
│   ├── check-in-time/
│   ├── timeout/
│   ├── caption-generator/
│   ├── tiktok-publisher/
│   ├── limit/
│   └── ...
├── workflows/               # Workflow definitions (auto-discovered)
│   └── tiktok-repost/
│       └── flow.yaml        # Pipeline definition
├── renderer/src/            # React frontend
│   ├── components/wizard/   # Shared wizard step components
│   │   ├── Step1_Details.tsx
│   │   ├── Step2_Sources.tsx
│   │   ├── Step4_Schedule.tsx
│   │   └── Step5_Target.tsx
│   └── detail/shared/
│       └── PipelineVisualizer.tsx # Campaign pipeline visualization
└── main/                    # Electron main process
    ├── services/
    │   └── CrashRecovery.ts # On-startup: reset interrupted jobs, reschedule missed videos
    ├── ipc/                 # IPC handlers
    └── db/                  # SQLite database
```

---

## Campaign Parameters (Source of Truth)

The campaign wizard saves a flat JSON object (`params`) into the `campaigns` table. All backend nodes receive this via `ctx.params`. Below is the **canonical parameter list** — use these exact names. Do NOT create aliases or additional fallbacks.

| Parameter | Type | Set By | Purpose |
|---|---|---|---|
| `name` | `string` | Step1 | Campaign display name |
| `campaignType` | `'scan_video' \| 'scan_channel'` | Step1 | Workflow mode |
| `captionTemplate` | `string` | Step1 | Caption template with `[Original Desc]`, `[Author]`, `[Tags]`, `[Time (HH:mm)]`, `[Date (YYYY-MM-DD)]` tags |
| `removeHashtags` | `boolean` | Step1 (optional) | Strip hashtags from original caption |
| `appendTags` | `string` | Step1 (optional) | Tags to append to the end of caption |
| `advancedVerification` | `boolean` | Step1 | Append unique tag to bypass dup checks |
| `autoSchedule` | `boolean` | Step1 | Auto-schedule or require manual approval |
| `missedJobHandling` | `'auto' \| 'manual'` | Step1 | What to do with missed scheduled videos |
| `firstRunAt` | `string (datetime-local)` | Step1/Step4 | Campaign start time |
| `intervalMinutes` | `number` | Step1/Step4 | **Gap (minutes) between videos.** Default: `60` |
| `enableJitter` | `boolean` | Step1 | Apply ±50% random jitter to the interval |
| `activeHoursStart` | `string (HH:mm)` | Step1 | Daily window start (legacy single-window) |
| `activeHoursEnd` | `string (HH:mm)` | Step1 | Daily window end (legacy single-window) |
| `activeDays` | `string[]` | Step1 | Active days as name array, e.g. `['Mon','Tue']` |
| `timeRanges` | `TimeRange[]` | Step4 | **Preferred** multi-slot active schedule (overrides `activeHoursStart/End`) |
| `sources` | `Source[]` | Step2 | TikTok channels/keywords to scan |
| `maxVideos` | `number` | Step3 (optional) | Max videos to process per run. Default: `100` |
| `selectedAccounts` | `string[]` | Step5 | Publish account IDs to use (round-robin) |
| `privacy` | `string` | Step5 (optional) | TikTok privacy setting. Default: `'public'` |

### TimeRange shape

```typescript
interface TimeRange {
  days: number[]   // 0=Sun, 1=Mon ... 6=Sat
  start: string    // "HH:mm"
  end: string      // "HH:mm"
}
```

### Priority order for time ranges

When backend nodes need to determine active hours, they use `normalizeTimeRanges(ctx.params)` from `nodes/_shared/timeWindow.ts`:
1. If `timeRanges` is present and non-empty → use it (multi-slot format, set by Step4).
2. Otherwise fall back to `activeHoursStart`, `activeHoursEnd`, `activeDays` (legacy single-window from Step1).
3. If nothing is set → 24/7 (all days, 00:00–23:59).

---

## How to Write a Node

Each node is a self-contained folder under `src/nodes/`. It is auto-discovered at runtime.

```
src/nodes/my-node/
├── manifest.ts    # Node metadata
├── backend.ts     # Execution logic
└── index.ts       # Entry point
```

### manifest.ts

```typescript
export const manifest = {
  id: 'my-namespace.my-node',   // Unique ID used in flow.yaml
  name: 'My Node',
  description: 'What this node does',
  category: 'processing',
}
```

### backend.ts

```typescript
import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // ctx.params      — campaign params (see table above — use canonical names only)
  // ctx.campaign_id — running campaign ID
  // ctx.logger.info / ctx.logger.error  — logs to DB (visible in UI)
  // ctx.onProgress('message')           — shows current status in PipelineVisualizer

  return {
    data: result,        // Passed as `input` to the next node
    action: 'continue',  // 'continue' | 'finish' (stop campaign)
    message: 'Done',     // Optional
  }
}
```

### Key Rules

- **Use only canonical `ctx.params` names** (see the table above). Never add `?? ctx.params.some_legacy_alias` fallbacks — this causes drift.
- **Return `{ data: null }`** to signal skip (e.g., deduplication).
- **Throw errors** for hard failures — the engine catches them and handles via the node's `on_error` config.
- **Use `ctx.logger`**, not `console.log`. Logs go to DB and show in the execution log UI.
- **Auto-discovery**: Create your folder + `index.ts` — it registers automatically via `import.meta.glob`.

### Shared Utilities

```typescript
import { normalizeTimeRanges, isWithinAnyWindow, nextValidSlot } from '../_shared/timeWindow'

// Get active time windows from campaign params
const ranges = normalizeTimeRanges(ctx.params)

// Check if current time is within any active window
if (!isWithinAnyWindow(new Date(), ranges)) { /* outside hours */ }

// Get timestamp of next valid slot (for scheduling)
const nextSlot = nextValidSlot(Date.now(), ranges)
```

---

## How to Write a Workflow

```
src/workflows/my-workflow/
├── flow.yaml        # Required: pipeline definition
└── wizard/          # Optional: wizard step configuration
```

### flow.yaml

```yaml
id: my-workflow
name: My Workflow
description: What this workflow does
icon: 🔧
color: "#8b5cf6"
version: "1.0"

nodes:
  - node_id: tiktok.scanner
    instance_id: scanner_1
    timeout: 30000           # Optional: node-level timeout (ms)

  - node_id: core.video_scheduler
    instance_id: scheduler_1

  # Loop node — runs children sequentially for each item
  - node_id: core.loop
    instance_id: video_loop
    children:
      - check_time_1         # Always first: waits for active hours + scheduled_for
      - dedup_1
      - downloader_1
      - caption_1
      - publisher_1

  - node_id: core.check_in_time
    instance_id: check_time_1

  - node_id: core.deduplicator
    instance_id: dedup_1

  - node_id: core.downloader
    instance_id: downloader_1

  - node_id: core.caption_gen
    instance_id: caption_1

  - node_id: tiktok.publisher
    instance_id: publisher_1
    on_error: skip           # 'skip' (default) | 'stop_campaign'

  - node_id: core.campaign_finish
    instance_id: finish_1

edges:
  - from: scanner_1
    to: scheduler_1
  - from: scheduler_1
    to: video_loop
  - from: video_loop
    to: finish_1
```

> **Note:** The `ui:` section and `wizard:` sections were removed from `flow.yaml` in v2.4.
> Wizard steps are React components registered separately (see below).

### Adding wizard steps

Wizard step components live in `src/renderer/src/components/wizard/`:

```tsx
interface MyStepProps {
  data: Record<string, any>
  updateData: (updates: Record<string, any>) => void
}

export function Step_MyStep({ data, updateData }: MyStepProps) {
  // Initialize defaults on mount with useEffect
  // Call updateData({ key: value }) to write into campaign params
  return <div>...</div>
}
```

Each step component must:
- **Initialize its defaults via `useEffect`** on mount (so the value is written to `params` even if the user never changes the field).
- **Always use canonical parameter names** when calling `updateData`.

---

## System Flow

```
1. User creates campaign via Wizard
   └─> campaign:create IPC → saves to DB with workflow_id + params (JSON)

2. User clicks "Run" → campaign:trigger IPC → FlowEngine.triggerCampaign()

3. FlowEngine loads flow.yaml, creates first Job → saved to `jobs` table

4. FlowEngine.tick() polls pending jobs every 500ms
   └─> Picks up job → executes node → logs to execution_logs

5. core.video_scheduler:
   └─> Assigns a scheduled_for timestamp to each video using time ranges + intervalMinutes
   └─> Videos saved to `videos` table with status='queued'

6. core.loop:
   └─> Iterates over each video item
   └─> Runs children: check_time → dedup → download → caption → publish
   └─> Checks campaign status between items (supports pause mid-loop)

7. core.check_in_time (first child in loop):
   └─> Step 1: If NOW is outside active hours → sleeps until next valid slot (nextValidSlot)
   └─> Step 2: If video has scheduled_for in the future → sleeps until that time

8. UI updates via:
   └─> Polling: campaign list refreshes every 3s
   └─> IPC events: execution:node-data, node:progress → PipelineVisualizer re-renders
```

---

## Built-in Nodes Reference

| Node ID | Purpose | Key `ctx.params` it reads |
|---|---|---|
| `tiktok.scanner` | Scans TikTok channels/keywords for new videos | `sources`, `campaignType` |
| `core.video_scheduler` | Assigns `scheduled_for` to each video | `intervalMinutes`, `timeRanges` / `activeHoursStart/End/Days` |
| `core.check_in_time` | Waits for active hours + per-video scheduled time | `timeRanges` / `activeHoursStart/End/Days` (via `normalizeTimeRanges`) |
| `core.deduplicator` | Skips already-processed videos | — |
| `core.downloader` | Downloads video to local disk | — |
| `core.caption_gen` | Generates caption from template | `captionTemplate`, `removeHashtags`, `appendTags` |
| `tiktok.publisher` | Publishes video to TikTok | `selectedAccounts`, `privacy` |
| `core.timeout` | Waits N minutes between videos (legacy) | `intervalMinutes`, `enableJitter` |
| `core.limit` | Limits number of items | `maxVideos` (default 100) |
| `core.condition` | Branches on an expression | `expression` (node-level param) |
| `core.notify` | Sends desktop notification | `title`, `body`, `sound` (node-level params) |
| `core.campaign_finish` | Marks campaign as complete | — |

> ⚠️ `core.timeout` is a **legacy** node. The current TikTok Repost workflow uses `core.check_in_time` as the first loop child instead, which handles both active-hours gating and per-video scheduling.

---

## Error Handling

### Per-Node `on_error` Config
```yaml
- node_id: tiktok.publisher
  instance_id: publisher_1
  on_error: stop_campaign    # Halt entire campaign on failure
```
- `skip` *(default)*: Skip the current item, continue with the next
- `stop_campaign`: Set campaign status to `'error'` and halt

### Captcha / Violation (Publisher-specific)
The publisher node handles these internally (does not throw):
- `captcha`: Returns `{ action: 'continue', data: { ...video, status: 'captcha' } }` → triggers `cond_captcha_1` branch.
- `violation`: Returns `{ action: 'continue', data: { ...video, status: 'violation' } }` → triggers `cond_violation_1` branch.

---

## IPC Event Names

| Event | Direction | Description |
|---|---|---|
| `campaign:list` | renderer → main | List all campaigns |
| `campaign:get` | renderer → main | Get single campaign |
| `campaign:create` | renderer → main | Create campaign |
| `campaign:trigger` | renderer → main | Start/run campaign |
| `campaign:pause` | renderer → main | Pause campaign |
| `campaign:resume` | renderer → main | Resume campaign |
| `campaign:delete` | renderer → main | Delete campaign |
| `campaign:get-jobs` | renderer → main | Get jobs for campaign |
| `campaign:get-logs` | renderer → main | Get execution logs |
| `campaign:get-flow-nodes` | renderer → main | Get flow definition for visualizer |
| `flow:get-presets` | renderer → main | List available workflows |
| `account:list` | renderer → main | List publish accounts |
| `account:add` | renderer → main | Add new TikTok publish account |

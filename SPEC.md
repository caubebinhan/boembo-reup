# Workflow Lifecycle Spec

Version: 2026-03-04
Scope: tiktok-repost workflow, Konva-based video editor integration, runtime message contract

## 1. Purpose
This spec defines:
1. Full lifecycle from Wizard -> campaign run -> finish/recovery.
2. Expected runtime messages/events and where they must appear in UI.
3. Edge-case behavior for Campaign Card, Campaign Detail, Pipeline Visualizer, and Wizard.
4. Current known gaps in the existing implementation (as-is audit), without code changes.

## 2. System Components
- Wizard (campaign creation + video edit config launcher):
  - `src/renderer/components/CampaignWizard.tsx`
  - `src/workflows/tiktok-repost/v1.0/wizard.ts`
  - `src/renderer/components/wizard/WizardDetails.tsx`
  - `src/renderer/components/wizard/WizardVideoEdit.tsx`
- Runtime engine/logging:
  - `src/core/engine/FlowEngine.ts`
  - `src/core/engine/ExecutionLogger.ts`
  - `src/main/index.ts` (PipelineEventBus forwarding)
  - `src/main/ipc/campaigns.ts`
- Workflow pipeline:
  - `src/workflows/tiktok-repost/v1.0/flow.yaml`
  - Node backends (`video-scheduler`, `video-downloader`, `video-edit`, `caption-generator`, `tiktok-publisher`, `tiktok-account-dedup`)
- UI runtime surfaces:
  - Campaign Card: `src/workflows/tiktok-repost/v1.0/card.tsx`
  - Campaign Detail shell: `src/renderer/components/CampaignDetail.tsx`
  - Workflow detail page: `src/workflows/tiktok-repost/v1.0/detail.tsx`
  - Visualizer: `src/renderer/detail/shared/PipelineVisualizer.tsx`
  - Video history in video card: `src/renderer/components/detail/VideoHistory.tsx`

## 3. End-to-End Lifecycle

### 3.1 Wizard Lifecycle
1. User opens wizard from Campaign List.
2. Wizard step 0 validates:
   - `name` required.
   - `workflow_id` must exist (passed from flow picker).
3. Workflow-specific steps for `tiktok-repost` in order:
   1. `details`
   2. `sources`
   3. `video-edit`
   4. `schedule`
   5. `target`
4. Video Edit step behavior:
   - Opens standalone editor window via `video-editor:open`.
   - Editor sends back `video-editor:done` with:
     - `videoEditOperations`
     - `_enabledPluginIds`
     - `_previewVideoSrc`
     - `_videoPath`
   - Wizard persists these values into campaign params payload.
5. On save, wizard calls `campaign:create` with merged `stepData` + `name` + `workflow_id`.

Expected result:
- Campaign document created with status `idle`.
- `campaign:created` + `campaigns-updated` emitted.

### 3.2 Campaign Trigger Lifecycle
1. User triggers campaign (`campaign:trigger`).
2. FlowEngine pre-run health check:
   - Storage free space check.
   - Workflow service endpoint checks.
3. If health check fails:
   - Campaign status -> `error`.
   - Emits/logs `campaign:healthcheck-failed`.
   - Emits renderer event `campaign:healthcheck-failed` with errors list.
4. If health check passes:
   - Campaign status -> `active`.
   - Emits/logs `campaign:triggered`.
   - Creates jobs for start nodes.

### 3.3 Pipeline Execution Lifecycle
Flow from `flow.yaml`:
- `start_gate` -> `scanner_1` -> `scheduler_1` -> `video_loop`
- `video_loop` children order per video:
  1. `check_time_1`
  2. `dedup_1`
  3. `downloader_1`
  4. `video_edit_1`
  5. `caption_1`
  6. `account_dedup_1`
  7. `publisher_1`
- Loop done -> `cond_mode_check_1` -> (`monitor_1` or `finish_1`).

Per node job contract (FlowEngine):
- `node:start` + `node:status(running)`
- zero/many `node:progress`
- `node:end` + `node:status(completed)` + `node:data`
- on error: `node:error` + `node:status(failed)` + `node:event:node:failed`

### 3.4 Finish/Resume/Pause Lifecycle
- Pause:
  - `campaign:pause` -> status `paused` + `campaign:paused` event.
- Resume:
  - Runs health check again.
  - On success status `active` + `campaign:resumed`.
  - If no pending/running jobs -> `campaign:retriggered` then trigger again.
- Finish:
  - If node returns action `finish` (or campaign-finish node runs), status -> `finished`.
  - Emits `campaign:finished`.

## 4. Runtime Message Contract

### 4.1 Core Engine/IPC Events
| Event | Source | Minimum payload | Intended consumers |
|---|---|---|---|
| `execution:log` | ExecutionLogger | `campaign_id,event,message,data_json,instance_id,node_id` | VideoHistory realtime append, debugging |
| `node:status` | ExecutionLogger (`nodeStart/nodeEnd/nodeError`) | `campaignId,instanceId,nodeId,status,jobId,error?` | Visualizer Redux active nodes |
| `node:progress` | ExecutionLogger | `campaignId,instanceId,nodeId,message,jobId` | Campaign Card live msg, Detail phase msg, Visualizer progress |
| `execution:node-data` | ExecutionLogger.nodeData | `campaignId,instanceId,nodeId,data,timestamp` | Detail rebuild hook |
| `node:event` | ExecutionLogger.emitNodeEvent | `campaignId,instanceId,event,data,timestamp` | Card alerts, Detail video status updates |
| `campaign:healthcheck-failed` | FlowEngine/main | `campaign_id,errors[],message` | Card alerts |
| `pipeline:info` | PipelineEventBus -> main/index forward | `campaignId?,message,...` | Card info alerts, VideoHistory system events |
| `campaigns-updated` | campaign IPC operations | none | Campaign list refresh/poll assist |

### 4.2 Domain Node Events (Expected)
| Event key | Emitted by | Payload highlights | UI expectation |
|---|---|---|---|
| `video:downloading` | downloader | `videoId,url` | timeline starts download phase |
| `video:downloaded` | downloader | `videoId,fileSizeMB,downloadDurationMs,localPath` | history shows file size + duration badge |
| `scheduler:scheduled` | scheduler | `videoId,scheduledFor,queueIndex` | history shows schedule timestamp |
| `scheduler:rescheduled` | scheduler | `videoId,newTime,reason` | history shows new schedule + missed reason |
| `video-edit:started` | video-edit | `videoId,operations[]` | history shows editing started |
| `video-edit:operation-applied` | video-edit | `videoId,operationId,pluginId,durationMs` | history detail for each applied op |
| `video-edit:completed` | video-edit | `videoId,operationCount,fileSizeMB,totalDurationMs,outputPath` | history shows edit stats |
| `video-edit:failed` | video-edit | `videoId,error` | history error card + inline retry button |
| `caption:transformed` | caption-generator | `videoId,original,generated,template` | history shows caption diff (before/after) |
| `video:active` | publisher | `videoId,title` | detail marks active video card |
| `video:publish-status` | publisher/verify handlers | `videoId,status,message,videoUrl,attempts,maxRetries,...` | detail updates video status + review metadata |
| `video:published` | publisher/verify handlers | `videoId,videoUrl,isReviewing?` | detail/history shows published link |
| `video:duplicate-detected` | publisher/account_dedup | `videoId,accountUsername,matchedBy,existingVideoUrl` | detail sets duplicate status + reason |
| `captcha:detected` | publisher | `videoId,...` | card alert + detail video status `captcha` |
| `violation:detected` | publisher | `videoId,error,...` | card alert + detail status `publish_failed` |
| `session:expired` | publisher | `videoId,accountUsername,error` | card alert + fail handling |
| `node:retry-scheduled` | FlowEngine | `attempt,maxRetries,delayMs,error,errorCode` | expected in history/logs |
| `node:failed` | FlowEngine/NodeHelpers | `error,retryable,errorCode,videoId?` | card generic error alert |

### 4.3 Campaign Events (Expected)
| Event key | Trigger | Typical message |
|---|---|---|
| `campaign:triggered` | campaign started | `Campaign triggered` |
| `campaign:paused` | manual pause/event rule/manual recovery mode | `Campaign paused` or reason |
| `campaign:resumed` | resume successful | `Campaign resumed` |
| `campaign:retriggered` | resume had no pending jobs | `No pending jobs - re-triggering` |
| `campaign:finished` | finish action reached | summary from finish node |
| `campaign:error` | fatal stop_campaign path | reason |
| `campaign:network-error` | network auto-pause | auto-paused message |
| `campaign:disk-error` | storage error | auto-failed message |
| `campaign:service-outage` | service monitor auto-pause | outage message |
| `pipeline:manual-retry` | visualizer/manual retry | node + job info |
| `pipeline:manual-skip` | error modal manual skip | skipped jobs count |

## 5. UI Surface Contracts

### 5.1 Campaign Card
Data sources:
- Polls campaign doc via list refresh every 3s.
- Realtime listeners:
  - `node:progress`
  - `node:event`
  - `campaign:healthcheck-failed`
  - `pipeline:info`
  - `campaign:network-error`
  - `campaign:disk-error`
  - `campaigns-updated`

Expected card behaviors:
- Show live phase text from latest `node:progress` while status active/running.
- Show alert chips for captcha/violation/session-expired/node-failed/healthcheck/pipeline-info/network/disk.
- Show status badge and counters derived from campaign `counters`.

### 5.2 Campaign Detail
Detail has 2 layers:
- Generic shell (`CampaignDetail.tsx`): polls `campaign:get` + `campaign:get-jobs` and reads `campaign:get-logs` for compact status message.
- Workflow detail (`tiktok-repost/detail.tsx`):
  - Rebuilds video timeline from `campaign:get-videos` + logs.
  - Listens realtime `execution:node-data`, `node:progress`, `node:event`.
  - Updates active video, publish status, duplicate details, captcha/violation states.

Expected history behavior in video card:
- Expand -> call `campaign:get-video-events`.
- Show rich timeline items by event type.
- Caption event must display:
  - original caption
  - transformed caption
- Error events show inline `Retry` button (`pipeline:retry-node`).

### 5.3 Pipeline Visualizer
Load contract:
- `campaign:get-flow-nodes` for graph metadata.
- `campaign:get` for params editing panel.
- `campaign:get-node-progress` for latest progress seed.
- Redux node stats from polled jobs (`setJobsForCampaign`) + live status (if `node:status` is wired).

User actions:
- Retry node: `pipeline:retry-node`.
- Save node settings: `campaign:update-params` then optional `campaign:trigger-event` (`on_save_event`, e.g. reschedule).
- Open error modal from failed node.

Expected node state mapping:
- `idle` / `running` / `done` / `error` from combination of job stats + active node info.

### 5.4 Wizard
Expected integration contract:
- wizard stores video-edit config only; actual FFmpeg processing happens later in runtime node `video_edit_1`.
- editor close with unsaved changes should prompt discard confirmation.
- editor `Done` must send result back via `video-editor:done`.

## 6. Missed Job Logic (Explicit)

### 6.1 During Scheduler Node Execution
When `core.video_scheduler` sees queued videos already in the past:
1. It auto-reschedules these videos from now using interval/jitter/time windows.
2. Emits `scheduler:rescheduled` per video.
3. Persists changes.
4. Adds campaign alert warning text.
5. Logs scheduler summary (`Rescheduled N missed videos`).

### 6.2 During Crash Recovery Startup
When app restarts and active campaign has missed queued videos:
- Read `params.missedJobHandling` (default `auto`).

If `manual`:
1. Campaign set to `paused`.
2. Alert added to campaign store.
3. `pipeline:info` emitted with manual pause message.
4. No reschedule/retrigger at this point.

If `auto`:
1. Missed videos rescheduled using shared scheduling helper.
2. Alert added to campaign store.
3. `pipeline:info` emitted with summary `Rescheduled N missed videos for campaign ...`.
4. Recovery continues; if no pending jobs, retrigger campaign.

## 7. Video Edit Node Guarantee (Explicit)
1. Flow order places `video_edit_1` before caption and publisher.
2. For each eligible video with `local_path`, node executes FFmpeg pipeline from `videoEditOperations`.
3. On success:
   - edited output path becomes new `local_path` in campaign video record.
   - emits `video-edit:completed` with operation/file/duration stats.
4. On no operations enabled:
   - node is a no-op (passthrough).
5. On failure:
   - emits `video-edit:failed`.
   - marks video status `failed` and throws user-facing error.

Important skip paths:
- If earlier loop node returns `data: null` (e.g. dedup skip/failGracefully), downstream non-utility nodes are skipped for that video.
- If video has no `local_path`, video-edit node passes through without modification.

## 8. Edge Cases and Expected Outcomes

| Edge case | Engine behavior | Expected message/events | Expected UI |
|---|---|---|---|
| Pre-run health check fails | campaign -> `error`, start/resume blocked | `campaign:healthcheck-failed` + log | card alert + error state |
| Network error in node | auto pause campaign | `campaign:network-error`, `campaign:healthcheck-failed`(renderer payload), node error logs | card network alert, status paused by polling |
| Disk/storage error | campaign -> `error` | `campaign:disk-error`, healthcheck-failed renderer event | card disk alert, status error |
| Node has retryPolicy and fails | failed job + retry job scheduled | `node:error`, `node:event:node:retry-scheduled` | history/log should show retry scheduling |
| Manual retry from visualizer/history | new pending job for that `instanceId` | `pipeline:manual-retry` | node re-executes |
| Manual skip from NodeErrorModal | marks latest failed jobs skipped | `pipeline:manual-skip` | visualizer/history reflects skip in logs |
| Publish CAPTCHA | keep loop alive, set video `captcha` | `captcha:detected` | card alert + detail status change |
| Publish violation | set `publish_failed` | `violation:detected` | card alert + detail status/error |
| Session expired | fail this video path, continue loop | `session:expired` | card alert, detail message |
| Duplicate detection | mark duplicate and skip upload | `video:duplicate-detected` + `video:publish-status(status=duplicate)` | detail duplicate badge/message |
| Async verify while campaign paused | verify task reschedules itself | `video:publish-status(status=verifying_publish, message=campaign paused...)` | detail status message updated |
| Service outage monitor | pauses affected active campaigns | `campaign:service-outage`, `service:health` | campaign pause visible via polling; service event currently optional UI |
| Editor closed via window controls | unsaved confirm; close emits null done payload | `video-editor:done` (null) | wizard remains with previous values |
| Video-edit preview render fails | returns `{ error, outputPath:null }` + progress trace | `video-edit:preview-progress` stream | editor should show failure message |

## 9. Status Coverage Matrix

### 9.1 Campaign statuses seen in UI config
Configured in card/detail badges:
- `idle`, `active`, `running`, `paused`, `finished`, `error`, `cancelled`, `needs_captcha`, `scheduling`

Actually set by current engine paths:
- Actively set: `idle`, `active`, `paused`, `finished`, `error`
- Present but not actively set in normal flow: `running`, `cancelled`, `needs_captcha`, `scheduling`

### 9.2 Video statuses in runtime
Common statuses:
- `queued`, `pending_approval`, `downloaded`, `captioned`, `publishing`, `published`,
- `under_review`, `verification_incomplete`, `verifying_publish`,
- `duplicate`, `captcha`, `publish_failed`, `failed`, `skipped`

## 10. Known Gaps (As-Is Audit)
1. Detail-only window does not mount `AppContent`, so global `node:status` listener is not active there.
   - Impact: Visualizer in standalone detail relies mostly on polled jobs, less realtime active-node error metadata.
2. `node:status` payload used in renderer currently passes `error`, but `errorCode` and `retryable` are not forwarded from `App.tsx` listener.
   - Impact: Visualizer rich error actions may miss retryability metadata.
3. `pipeline:retry-node` IPC currently retries by `instanceId` (node-level), ignores per-video scoping even if caller sends `videoId`.
   - Impact: retry from VideoHistory is broad node retry, not strict single-video retry.
4. `campaign:alert` and `service:health` are emitted but no clear main UI subscriber for dedicated alert panel rendering.
5. `PipelineVisualizer` fetches flow graph with `{ workflowId }` only, not `campaignId` snapshot.
   - Impact: possible graph drift if workflow definition changes after campaign creation.
6. `campaign:get-video-events` query includes `message LIKE %videoId%` fallback.
   - Impact: possible false-positive matches for similar IDs/text.
7. Campaign Card status badge includes `needs_captcha` and `scheduling`, but those campaign-level statuses are not currently set by core flow paths.

## 11. Acceptance Checklist
Use this list to validate the lifecycle contract quickly:
1. Wizard creates campaign with `videoEditOperations` in params.
2. Trigger campaign emits `campaign:triggered` and start node jobs.
3. For one normal video path, events appear in order:
   - `video:downloading` -> `video:downloaded`
   - `video-edit:started` -> `video-edit:completed`
   - `caption:transformed`
   - `video:active` -> `video:publish-status` -> `video:published`
4. Missed jobs behave by mode (`auto` reschedule / `manual` pause).
5. Campaign Card shows live progress + alerts from runtime events.
6. Detail view updates video status from `node:event` and shows rich history per video.
7. Visualizer allows retry and settings save, and reflects node states from stats/progress.
8. Edge cases produce meaningful message/event records in logs/history.

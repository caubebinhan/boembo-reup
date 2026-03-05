# Workflow Lifecycle Spec

Version: 2026-03-05
Scope: tiktok-repost workflow, Konva-based video editor integration, runtime message contract

## 1. Purpose
This spec defines:
1. Full lifecycle from Wizard -> campaign run -> finish/recovery.
2. Expected runtime messages/events and where they must appear in UI.
3. Edge-case behavior for Campaign Card, Campaign Detail, Pipeline Visualizer, and Wizard.
4. Concurrency guardrails (per-campaign pipeline lock, per-video processing lock).
5. Error handling patterns (`failGracefully` / `failBatchGracefully`).

---

## 2. System Components

### 2.1 Wizard (Campaign Creation)
- `src/renderer/components/CampaignWizard.tsx`
- `src/workflows/tiktok-repost/v1.0/wizard.ts`
- `src/renderer/components/wizard/WizardDetails.tsx`
- `src/renderer/components/wizard/WizardVideoEdit.tsx`

### 2.2 Runtime Engine
- `src/core/engine/FlowEngine.ts` — Job poller, loop executor, retry/edge logic
- `src/core/engine/ExecutionLogger.ts` — Centralized logging (console + SQLite + IPC)
- `src/core/engine/VideoProcessingLock.ts` — Per-video + per-campaign locks
- `src/core/nodes/NodeHelpers.ts` — `failGracefully`, `failBatchGracefully`, error classifiers
- `src/core/errors/CodedError.ts` — `DG-xxx` error code system

### 2.3 Async Task System
- `src/main/services/AsyncTaskScheduler.ts` — Background task poller (30s tick)
- `src/core/async-tasks/AsyncTaskRegistry.ts` — Handler registration
- `src/main/db/repositories/AsyncTaskRepo.ts` — DB operations + lease management

### 2.4 Workflow Pipeline
- `src/workflows/tiktok-repost/v1.0/flow.yaml` — DAG definition
- `src/workflows/tiktok-repost/v1.0/events.ts` — Desktop notification handlers

### 2.5 Node Backends
| Instance ID | Node ID | File | Purpose |
|------------|---------|------|---------|
| `start_gate` | `core.check_in_time` | `nodes/check-in-time/backend.ts` | Wait for campaign start time |
| `scanner_1` | `tiktok.scanner` | `nodes/tiktok-scanner/backend.ts` | Scan TikTok sources for videos |
| `scheduler_1` | `core.video_scheduler` | `nodes/video-scheduler/backend.ts` | Compute schedule timestamps |
| `check_time_1` | `core.check_in_time` | `nodes/check-in-time/backend.ts` | Per-video time gate |
| `dedup_1` | `tiktok.account_dedup` | `nodes/tiktok-account-dedup/backend.ts` | Duplicate detection |
| `downloader_1` | `core.video_downloader` | `nodes/video-downloader/backend.ts` | Download video file |
| `video_edit_1` | `core.video_edit` | `nodes/video-edit/backend.ts` | FFmpeg pipeline edits |
| `caption_1` | `core.caption_generator` | `nodes/caption-generator/backend.ts` | Caption templating |
| `account_dedup_1` | `tiktok.account_dedup` | `nodes/tiktok-account-dedup/backend.ts` | Account-level dedup |
| `publisher_1` | `tiktok.publisher` | `nodes/tiktok-publisher/backend.ts` | Publish to TikTok |
| `monitor_1` | `tiktok.monitoring` | `nodes/monitoring/backend.ts` | Post-publish monitoring |
| `finish_1` | `core.campaign_finish` | `nodes/campaign-finish/backend.ts` | Campaign completion |
| `timeout_*` | `core.timeout` | `nodes/timeout/backend.ts` | Interval delay |
| `cond_*` | `core.condition` | `nodes/condition/backend.ts` | Branch condition |
| `js_runner_*` | `core.js_runner` | `nodes/js-runner/backend.ts` | Custom JS execution |

### 2.6 UI Runtime Surfaces
- Campaign Card: `src/workflows/tiktok-repost/v1.0/card.tsx`
- Campaign Detail: `src/workflows/tiktok-repost/v1.0/detail.tsx`
- Visualizer: `src/renderer/detail/shared/PipelineVisualizer.tsx`
- Video History: `src/renderer/components/detail/VideoHistory.tsx`

---

## 3. End-to-End Lifecycle

### 3.1 Wizard Lifecycle
1. User opens wizard from Campaign List.
2. Workflow-specific steps for `tiktok-repost`:
   `details` → `sources` → `video-edit` → `schedule` → `target`
3. Video Edit step opens standalone editor window via `video-editor:open`.
4. On save: `campaign:create` → campaign doc with status `idle`.

### 3.2 Campaign Trigger
1. `campaign:trigger` → FlowEngine pre-run health check (disk space, service endpoints).
2. Fail → status `error` + `campaign:healthcheck-failed` event.
3. Pass → status `active` + `campaign:triggered` + jobs for start nodes.

### 3.3 Pipeline Execution (flow.yaml)
```
start_gate → scanner_1 → scheduler_1 → video_loop
  video_loop children (per video):
    check_time_1 → dedup_1 → downloader_1 → video_edit_1
    → caption_1 → account_dedup_1 → publisher_1 → timeout_1
  loop done → cond_mode_check_1 → (monitor_1 or finish_1)
```

### 3.4 Pause / Resume / Finish
- **Pause**: `campaign:pause` → status `paused`. Does NOT force-release locks — running job exits naturally via `isCampaignActive()` check.
- **Resume**: Health check → status `active`. Resumes from `_loopData` state if mid-loop, else re-triggers.
- **Finish**: `campaign-finish` node → status `finished` + `campaign:finished` event.

---

## 4. Concurrency & Lock Architecture

### 4.1 CampaignPipelineLock (per-campaign)
- Only ONE job executes at a time per campaign.
- Stale timeout: 30 minutes.
- Acquired at `executeJob()` entry, released in `finally` block.
- If busy: job returns to `pending` for next tick.

### 4.2 VideoProcessingLock (per-video)
- Only ONE pipeline step per video at any time.
- Stale timeout: 10 minutes.
- Acquired per-video in loop iteration, released in `finally` block.
- Lock-rejected: `continue` without advancing `lastProcessedIndex` → retried next run.
- On campaign pause/finish/error: `releaseAllForCampaign()`.

### 4.3 AsyncTask Lease System
- DB-based lease (`claimDue` + `extendLease`).
- Crash recovery: `reclaimExpiredLeases()` on startup + every tick.
- Exponential backoff on retryable fails (30s × 2^attempt, max 5min).
- Auto-prune completed tasks older than 7 days.

---

## 5. Error Handling Patterns

### 5.1 `failGracefully(ctx, instanceId, platformId, errorType, message, opts?)`
Used for **recoverable per-video errors** (download fail, publish fail, dedup skip).
- Updates video status to `opts.statusOverride || 'failed'`.
- Emits `node:failed` event **unless** `opts.suppressEvent === true`.
- Returns `{ action: 'continue', data: null }` → loop skips remaining children for this video.

**`suppressEvent` pattern**: When a node emits its own specific event (e.g. `publish:failed`, `download:failed`), it should pass `suppressEvent: true` to avoid duplicate events in timeline.

### 5.2 `failBatchGracefully(ctx, instanceId, errorType, message, opts?)`
Same as above but for **source/batch nodes** (scanner). Returns `{ data: [] }`.

### 5.3 `throw` (Hard Fail)
Used for **fatal errors** that should trigger retry policy or stop.
- FlowEngine catches, checks `retryPolicy` from node manifest.
- If retryable: creates retry job with `_retryCount` + exponential delay.
- If not: emits `node:failed` + checks network/disk auto-pause.

### 5.4 YAML Event Matching
When a child node throws inside the loop, error message is matched against `events:` in flow.yaml.
Actions: `pause_campaign`, `stop_campaign`, `skip_item`.

---

## 6. Runtime Events Contract

### 6.1 Core Engine/IPC Events
| Event | Source | Consumers |
|-------|--------|-----------|
| `execution:log` | ExecutionLogger | VideoHistory, debugging |
| `node:status` | ExecutionLogger (start/end/error) | Visualizer node states |
| `node:progress` | ExecutionLogger | Card live msg, Visualizer |
| `execution:node-data` | ExecutionLogger.nodeData | Detail rebuild hook |
| `node:event` | ExecutionLogger.emitNodeEvent | Card alerts, VideoHistory |
| `campaign:healthcheck-failed` | FlowEngine | Card alerts |
| `pipeline:info` | PipelineEventBus | Card info alerts |
| `campaigns-updated` | IPC operations | Campaign list refresh |

### 6.2 Domain Node Events
| Event key | Emitted by | Desktop Notification? | VideoHistory label |
|-----------|-----------|----------------------|-------------------|
| `video:downloading` | downloader | ❌ | Đang tải |
| `video:downloaded` | downloader | ❌ | Đã tải |
| `download:failed` | downloader | ✅ "Tải video thất bại" | Tải thất bại |
| `scan:failed` | scanner/monitoring | ✅ "Quét nguồn thất bại" | Quét thất bại |
| `scheduler:scheduled` | scheduler | ❌ | Lên lịch |
| `scheduler:rescheduled` | scheduler | ❌ | Lên lịch lại |
| `video-edit:started` | video-edit | ❌ | Bắt đầu chỉnh sửa |
| `video-edit:completed` | video-edit | ❌ | Chỉnh sửa xong |
| `video-edit:failed` | video-edit | ❌ | Chỉnh sửa thất bại |
| `caption:transformed` | caption-gen | ❌ | Tạo caption |
| `video:active` | publisher | ❌ | Đang xử lý |
| `video:publish-status` | publisher | ❌ | Trạng thái đăng |
| `video:published` | publisher | ✅ "Đăng video thành công" | Đã đăng |
| `publish:failed` | publisher | ✅ "Đăng video thất bại" | Đăng thất bại |
| `captcha:detected` | publisher | ✅ "CAPTCHA detected" | Phát hiện CAPTCHA |
| `violation:detected` | publisher | ✅ "Vi phạm nội dung" | Vi phạm |
| `session:expired` | publisher | ❌ | Phiên hết hạn |
| `video:duplicate-detected` | dedup | ❌ | Trùng lặp |
| `node:failed` | NodeHelpers (generic) | ❌ | Lỗi |
| `node:retry-scheduled` | FlowEngine | ❌ | Thử lại |

### 6.3 Campaign Events
| Event | Trigger |
|-------|---------|
| `campaign:triggered` | Campaign started |
| `campaign:paused` | Manual/event/network pause |
| `campaign:resumed` | Resume successful |
| `campaign:retriggered` | Resume had no pending jobs |
| `campaign:finished` | Finish node reached |
| `campaign:error` | Fatal stop_campaign |
| `campaign:network-error` | Network auto-pause |
| `campaign:disk-error` | Storage error auto-fail |
| `pipeline:manual-retry` | Visualizer retry action |

---

## 7. UI Surface Contracts

### 7.1 Campaign Card (`card.tsx`)
**Listeners**: `node:progress`, `node:event`, `campaign:healthcheck-failed`, `pipeline:info`, `campaign:network-error`, `campaign:disk-error`, `campaigns-updated`

**Status badges** (all in Vietnamese):
`Chờ`, `Đang chạy`, `Tạm dừng`, `Xong`, `Lỗi`, `Đã hủy`, `Captcha`, `Lên lịch`, `Đăng nhập lại`, `Phục hồi`, `Suy giảm`

**Counter pills**:
`Đang chờ`, `Chờ duyệt`, `Đã tải`, `Đã tạo caption`, `Đã đăng`, `Đã gửi chờ duyệt`, `Captcha`, `Trùng`, `Thất bại`, `Bỏ qua`

**Action buttons** (with loading state via `actionInFlight`):
`Chạy`, `Dừng`, `Tiếp tục` — disabled + "⏳ Đang..." while in-flight.

### 7.2 Campaign Detail (`detail.tsx`)
- Polls campaign + jobs.
- Listens `execution:node-data`, `node:progress`, `node:event`.
- Video cards show retry button for `publish_failed` and `captcha` statuses.
- Retry dispatches `pipeline:retry-node` scoped to the correct node.

### 7.3 Video History (`VideoHistory.tsx`)
- Triggered by expanding a video card.
- Fetches from `campaign:get-video-events`.
- Displays timeline with category-aware styling (success/error/progress/info/system).
- Maps all node events via `EVENT_CONFIG` to Vietnamese labels.

### 7.4 Pipeline Visualizer
- Fetches flow graph via `campaign:get-flow-nodes` with `campaignId`.
- Shows node states (idle/running/done/error) from job stats.
- Supports: retry node, save settings, error modal.

---

## 8. Video Edit Node Guarantee
1. `video_edit_1` runs BEFORE caption and publisher in the loop.
2. FFmpeg pipeline from `videoEditOperations` in campaign params.
3. Success → edited output becomes new `local_path`.
4. No operations enabled → passthrough (no-op).
5. Failure → `video-edit:failed` event + video status `failed` + throws.

---

## 9. Missed Job Logic

### 9.1 During Scheduler Execution
Auto-reschedules past-due videos. Emits `scheduler:rescheduled` per video. Alert shown.

### 9.2 During Crash Recovery
Based on `params.missedJobHandling`:
- `manual`: pause campaign + alert.
- `auto`: reschedule + retrigger.

---

## 10. Status Coverage Matrix

### Campaign Statuses
Set by engine: `idle`, `active`, `paused`, `finished`, `error`
UI-only badges: `running`, `cancelled`, `needs_captcha`, `scheduling`, `session_expired`, `recovering`, `degraded`

### Video Statuses
`queued`, `pending_approval`, `downloaded`, `captioned`, `publishing`, `published`, `under_review`, `verification_incomplete`, `verifying_publish`, `duplicate`, `captcha`, `publish_failed`, `failed`, `skipped`

---

## 11. Known Limitations
1. `pipeline:retry-node` retries by `instanceId` (node-level), not per-video scoped.
2. `campaign:alert` events are emitted but no dedicated alert panel in UI.
3. `video-editor:done` sends null payload if editor closed without saving.
4. Visualizer node states rely mostly on polled jobs, less realtime metadata.

---

## 12. Quick Acceptance Checklist
1. Wizard creates campaign with `videoEditOperations` in params.
2. Trigger emits `campaign:triggered` + start node jobs.
3. Normal video path events appear in order:
   `video:downloading` → `video:downloaded` → `video-edit:completed` → `caption:transformed` → `video:active` → `video:published`
4. Download fail → `download:failed` event → desktop notification → VideoHistory "Tải thất bại".
5. Scan fail → `scan:failed` event → desktop notification → VideoHistory "Quét thất bại".
6. Publish fail → `publish:failed` event only (no duplicate `node:failed`) → desktop notification → VideoHistory "Đăng thất bại".
7. Card shows live progress + correct VI status labels.
8. Pause/Resume works with proper lock lifecycle.
9. Edge cases produce meaningful events in logs/history.

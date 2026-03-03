# Project Structure

> Tra cứu nhanh cấu trúc thư mục và chức năng từng file/folder.

---

## `src/core/` — Logic dùng chung (không phụ thuộc Electron)

| Thư mục | Chức năng |
|---------|-----------|
| `engine/FlowEngine.ts` | Chạy pipeline: poll jobs, execute nodes, xử lý loop/recall |
| `engine/ExecutionLogger.ts` | Ghi log vào DB + emit event cho renderer |
| `engine/PipelineEventBus.ts` | EventEmitter singleton cho inter-module events |
| `flow/FlowLoader.ts` | Load `flow.yaml`, parse thành FlowDefinition |
| `flow/ExecutionContracts.ts` | Interfaces: FlowDefinition, FlowNodeDefinition, FlowEdgeDefinition |
| `nodes/NodeDefinition.ts` | Interfaces: NodeManifest, NodeExecutionContext, NodeExecutionResult |
| `nodes/NodeRegistry.ts` | Registry toàn cục — nodes tự đăng ký |
| `nodes/NodeHelpers.ts` | `failGracefully()`, `setVideoStatus()`, `isNetworkError()` |
| `async-tasks/types.ts` | AsyncTaskDocument, AsyncTaskHandler, AsyncTaskDecision |
| `async-tasks/AsyncTaskRegistry.ts` | Registry cho async task handlers |
| `errors/CodedError.ts` | Class `CodedError` — throw kèm mã DG-xxx |
| `troubleshooting/error-codes.ts` | Registry lỗi DG-xxx (flat array, tiếng Việt) |
| `troubleshooting/errorResolution.ts` | Wrapper cho UI: errorCode → userTitle, cause, solutions |
| `troubleshooting/handlers/` | Mỗi mã lỗi → `DG-xxx.handler.ts` chạy diagnostics thật |
| `video-edit/types.ts` | VideoEditPlugin, VideoEditOperation, PluginContext |
| `video-edit/ports.ts` | Interface `VideoProcessor` (implemented bởi FFmpegAdapter) |
| `video-edit/VideoEditPipeline.ts` | Engine chạy plugin pipeline |
| `video-edit/VideoEditPluginRegistry.ts` | Registry plugin singleton |
| `video-edit/plugins/` | Plugins: anti-detect (9), audio, filter, overlay, transform |

---

## `src/nodes/` — Node implementations (17 nodes + `_shared`)

Mỗi node = 1 thư mục gồm 3 file:
- `manifest.ts` — metadata (id, name, category, config_schema, retryPolicy)
- `backend.ts` — logic `execute(input, ctx)`
- `index.ts` — export manifest + execute, tự đăng ký vào NodeRegistry

| Node | Chức năng |
|------|-----------|
| `tiktok-scanner` | Quét kênh TikTok, trả danh sách video |
| `video-downloader` | Tải video về local |
| `video-edit` | Chạy FFmpeg plugin pipeline |
| `caption-generator` | Sinh caption từ template |
| `video-scheduler` | Phân bổ slot thời gian |
| `tiktok-publisher` | Upload + đăng video lên TikTok |
| `tiktok-account-dedup` | Kiểm tra trùng lặp per-account |
| `deduplicator` | Kiểm tra trùng lặp toàn hệ thống |
| `monitoring` | Quét liên tục nguồn, feed video mới |
| `quality-filter` | Lọc video theo tiêu chí chất lượng |
| `file-source` | Đọc video từ thư mục local |
| `condition` | Rẽ nhánh theo điều kiện |
| `limit` | Giới hạn số video xử lý |
| `check-in-time` | Kiểm tra trong khung giờ |
| `timeout` | Đợi thời gian trước khi tiếp tục |
| `js-runner` | Chạy custom JS code |
| `campaign-finish` | Đánh dấu campaign hoàn thành |

---

## `src/workflows/` — Workflow packages (versioned)

```
workflows/
  index.ts              # Auto-discovery: scan */v*/recovery.ts, ipc.ts, services.ts, events.ts
  tiktok-repost/v1.0/
    flow.yaml           # Pipeline definition (nodes + edges)
    wizard.ts           # Wizard steps cho renderer
    card.tsx            # Campaign card component
    detail.tsx          # Campaign detail view
    recovery.ts         # Crash recovery logic
    ipc.ts              # Workflow-specific IPC handlers
    services.ts         # Service setup (auto-loaded)
    events.ts           # Event listeners
  upload-local/v1.0/
    ...                 # Cấu trúc tương tự
```

**Auto-discovery:**
- Main: `workflows/index.ts` scan `*/v*/recovery.ts`, `ipc.ts`, `services.ts`, `events.ts`
- Renderer: `workflowWizardRegistry.ts` scan `*/v*/wizard.{ts,tsx}`

---

## `src/main/` — Electron main process

| File/Thư mục | Chức năng |
|--------------|-----------|
| `index.ts` | Entry point: initDb, FlowLoader, FlowEngine, IPC setup |
| `sentry.ts` | Sentry error tracking |
| **services/** | |
| `CrashRecovery.ts` | Startup: reset stuck jobs |
| `AsyncTaskScheduler.ts` | Background scheduler (30s tick) |
| `ServiceHealthMonitor.ts` | Ping workflow URLs, auto-pause |
| `PublishAccountService.ts` | TikTok account quản lý qua BrowserWindow |
| `BrowserService.ts` | Playwright browser pooling |
| `AppSettingsService.ts` | Key-value settings |
| `TroubleshootingService.ts` | Chạy test cases, lưu results |
| **ipc/** | IPC handlers (1 file = 1 domain) |
| `campaigns.ts` | Campaign CRUD + flow operations |
| `scanner.ts` | Scanner window |
| `video-editor.ts` | Video editor window |
| `accounts.ts` | Publish account CRUD |
| `wizard.ts` | Wizard session |
| `settings.ts` | App settings + health checks |
| `troubleshooting.ts` | Troubleshooting panel + per-error handler dispatch |
| **ffmpeg/** | |
| `FFmpegBinary.ts` | Binary resolution + execution |
| `FFmpegCommandBuilder.ts` | Command construction |
| `FFmpegProbe.ts` | Video probing |
| `FFmpegAdapter.ts` | Implement `VideoProcessor` interface từ core |
| **tiktok/** | TikTok publisher + scanner modules |
| **db/** | SQLite: `Database.ts` (schema) + `repositories/` |

---

## `src/renderer/` — React frontend

| File/Thư mục | Chức năng |
|--------------|-----------|
| `App.tsx` | Root component: routing, modals, workflow picker |
| `main.tsx` | ReactDOM entry |
| `store/` | Redux Toolkit: campaigns, pipeline, nodeEvents, interaction slices |
| `components/` | UI components: SplashScreen, DebugDashboard (`components/debug/*`), video-editor |
| `wizard/` | Wizard pages + `workflowWizardRegistry.ts` (auto-discover) |
| `detail/shared/PipelineVisualizer.tsx` | Pipeline visualization + InspectPanel |
| `hooks/` | Custom React hooks |

---

## Database Schema

SQLite document-store. Mỗi bảng có `data_json` chứa toàn bộ data dạng JSON.

### campaigns
| Cột | Mô tả |
|-----|-------|
| `id` (PK) | 8-char hex |
| `data_json` | name, workflow_id, status, params, videos[], alerts[], counters, flow_snapshot |
| `created_at`, `updated_at` | Unix timestamp |

> `videos[]` nằm trong data_json, KHÔNG phải bảng riêng.

### jobs
| Cột | Mô tả |
|-----|-------|
| `id` (PK) | UUID |
| `data_json` | workflow_id, node_id, instance_id, status, error_message, input data |
| `status` | pending / running / completed / failed |
| `campaign_id`, `scheduled_at` | Index columns |

### async_tasks
| Cột | Mô tả |
|-----|-------|
| `id` (PK) | UUID |
| `data_json` | Full AsyncTaskDocument |
| `task_type` | Handler key (e.g. `tiktok.publish.verify`) |
| `status` | pending / claimed / running / completed / failed / timed_out |
| `dedupe_key` | UNIQUE guard chống trùng |
| `next_run_at`, `lease_until` | Scheduler polling |

### Các bảng khác
- `execution_logs` — Log events per node
- `publish_accounts` — Tài khoản TikTok
- `publish_history` — Lịch sử publish (dedup)
- `app_settings` — Key-value settings

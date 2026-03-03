# Boembo Developer Guide

> Tài liệu onboarding cho developer mới. Đọc file này trước, rồi mở `PROJECT_STRUCTURE.md` khi cần tra cứu chi tiết.

---

## Boembo là gì?

Boembo là ứng dụng desktop (Electron) tự động hoá việc **quét → tải → chỉnh sửa → đăng video TikTok**. Người dùng tạo **campaign** theo workflow, hệ thống chạy ngầm từng bước (node) theo pipeline.

---

## Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────┐
│  Renderer (React + Redux)                       │
│  - Giao diện: danh sách campaign, wizard,       │
│    visualizer, video editor                     │
│  - Giao tiếp với Main qua IPC (window.api)      │
├─────────────────────────────────────────────────┤
│  Preload                                        │
│  - Bridge giữa Renderer ↔ Main                  │
│  - Expose: invoke(), on(), removeAllListeners() │
├─────────────────────────────────────────────────┤
│  Main (Electron main process)                   │
│  - FlowEngine chạy pipeline                     │
│  - Các service: DB, browser, scheduler          │
│  - FFmpeg, TikTok publisher/scanner             │
├─────────────────────────────────────────────────┤
│  Core (shared logic, không phụ thuộc Electron)  │
│  - Contracts, interfaces, registry              │
│  - Không import main/ hay renderer/             │
└─────────────────────────────────────────────────┘
```

**Quy tắc quan trọng:**
- `core/` KHÔNG được import từ `main/` hay `renderer/` — chỉ định nghĩa contracts
- `main/` implement các interface từ `core/`
- `renderer/` chỉ giao tiếp qua IPC, KHÔNG import trực tiếp `main/`

---

## Luồng hoạt động chính

### 1. Tạo Campaign

```
User mở app → Bấm "+ New Campaign" → Chọn Workflow (workflow khác nhau có steps khác nhau)
→ Wizard hiện ra các bước do workflow tự định nghĩa (Setup → workflow-specific steps)
→ Điền thông tin → Submit → Campaign được lưu vào DB với flow_snapshot
```

### 2. Chạy Campaign

```
FlowEngine poll DB mỗi 30s → Tìm campaign "running"
→ Duyệt qua từng node trong flow_snapshot
→ Mỗi node tạo Job, execute(), trả kết quả cho node tiếp theo
→ Khi đến loop node: lặp lại các child nodes cho từng video
→ Nếu lỗi: retry theo retryPolicy hoặc emit node:failed
```

### 3. Pipeline một video (tiktok-repost)

```
Scanner quét kênh TikTok → Tìm video mới
→ Downloader tải video về local
→ Video Edit (FFmpeg plugins: crop, resize, anti-detect...)
→ Caption Generator (template → text)
→ Scheduler (chọn slot thời gian)
→ Publisher (mở browser, upload lên TikTok Studio)
→ Verify (kiểm tra video đã đăng thành công)
```

### 4. AsyncTask (chạy nền)

Một số thao tác chạy lâu (verify publish, retry) được schedule qua `AsyncTaskScheduler`:
- Task lưu trong DB, scheduler poll mỗi 30s
- Handler tự đăng ký qua `asyncTaskRegistry.register()`
- Hỗ trợ retry tự động với exponential backoff

---

## Các khái niệm cốt lõi

### Node
Đơn vị xử lý nhỏ nhất. Mỗi node có `manifest` (metadata) và `execute()` (logic).
- 18 nodes trong `src/nodes/`, mỗi node = 1 thư mục với `manifest.ts` + `backend.ts` + `index.ts`
- Auto-discovered qua `import.meta.glob` trong `src/nodes/index.ts`

### Flow (Workflow)
Pipeline gồm nhiều nodes nối nhau bằng edges. Định nghĩa trong `flow.yaml`.
- 2 workflows: `tiktok-repost`, `upload-local`
- Versioned: `src/workflows/{name}/v1.0/`

### Campaign
1 lần chạy workflow. Lưu trong DB, chứa params + videos[] + flow_snapshot.

### Job
1 lần thực thi 1 node. FlowEngine tạo job → node execute → kết quả → job tiếp theo.

---

## Error Code System

Tất cả exception dùng `CodedError`. Mỗi lỗi mang mã `DG-xxx`.

```typescript
import { CodedError } from '@core/errors/CodedError'
throw new CodedError('DG-042', 'Node implementation not registered')
```

| Range | Nhóm |
|-------|------|
| DG-001..009 | Hạ tầng (FFmpeg, DB, mạng) |
| DG-010..029 | FFmpeg (encode, probe) |
| DG-030..049 | Database, FlowEngine |
| DG-050..059 | IPC validation |
| DG-100..139 | Publish & account |
| DG-200..212 | Scanner & download |
| DG-300..399 | Campaign & wizard |
| DG-400..404 | Caption & transform |
| DG-500..503 | Tương thích & khôi phục |
| DG-600..612 | Video editor |
| DG-700..726 | Sentry & troubleshooting |

Registry: `src/core/troubleshooting/error-codes.ts` — flat array, mỗi entry đầy đủ (tiếng Việt).
Mỗi mã lỗi có handler riêng: `src/core/troubleshooting/handlers/DG-xxx.handler.ts`.

---

## Retry & Error Handling

### Node retry (tự động)
Khi node throw → FlowEngine đọc `manifest.retryPolicy` → tạo job mới với delay.

### AsyncTask retry
Handler trả `{ action: 'fail', retryable: true }` → scheduler retry với backoff `min(300s, 30s × 2^n)`.

### Manual retry (UI)
User bấm "Retry" trên InspectPanel → IPC `pipeline:retry-node` → tạo job mới.

---

## Database

SQLite document-store. Mỗi bảng có `data_json` (JSON blob) + vài cột denormalized cho index/query.

| Bảng | Chứa gì |
|------|---------|
| `campaigns` | Campaign data, videos[], alerts[], counters |
| `jobs` | Từng lần execute node |
| `execution_logs` | Log events (node:start, node:end, node:error) |
| `publish_accounts` | Tài khoản TikTok (cookies, proxy) |
| `publish_history` | Lịch sử publish (dedup) |
| `async_tasks` | Task chạy nền (verify, retry) |
| `app_settings` | Key-value settings |

> Lưu ý: Videos KHÔNG phải bảng riêng — nằm trong `campaigns.data_json` → `videos[]`.

---

## Conventions quan trọng

1. **Không dùng `throw new Error()`** — luôn dùng `CodedError('DG-xxx', msg)`
2. **Tất cả lỗi hiển thị tiếng Việt** cho user
3. **Node auto-discovery** — chỉ cần tạo thư mục + export trong `index.ts`
4. **IPC single-responsibility** — mỗi file trong `main/ipc/` xử lý 1 domain
5. **Campaign params là source of truth** — nodes đọc từ `ctx.params`, không hardcode
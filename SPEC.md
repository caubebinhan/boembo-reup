# Project Spec - Folder, YAML, Node, Workflow

Version: 2026-03-06
Audience: Dev moi, chua biet gi ve du an.

## 0) Doc nhanh (1 phut)

Neu ban can lam viec ngay, doc theo thu tu:
1. Muc 2: Cau truc thu muc
2. Muc 3: Cach viet `flow.yaml`
3. Muc 4: Cach lam node moi
4. Muc 5: Cach lam workflow moi

---

## 1) Du an nay la gi?

Boembo la desktop app (Electron + React + TypeScript) chay workflow pipeline cho video.

Khung nghiep vu:
- Workflow = graph node + edge (dinh nghia trong `flow.yaml`)
- Campaign = 1 lan chay workflow voi params cu the
- Job = 1 lan execute 1 node
- Node = 1 buoc xu ly (scan, download, edit, publish...)

Campaign khi tao se luu `flow_snapshot`, nen campaign cu khong bi anh huong boi thay doi `flow.yaml` moi.

---

## 2) Cau truc thu muc (ro rang de tim file)

## 2.1 Root

```text
C:/boembo2/
  src/
    core/
    main/
    preload/
    renderer/
    nodes/
    workflows/
    shared/
  tests/
    unit/
    e2e/
    debug/
  docs/
  scripts/
  SPEC.md
  README.md
  package.json
```

## 2.2 `src/` theo layer

```text
src/
  core/        # Engine + contracts + logic dung chung
  main/        # Electron main process (DB, IPC, services, integrations)
  preload/     # Bridge window.api cho renderer
  renderer/    # React UI
  nodes/       # Node implementations (manifest + execute)
  workflows/   # Workflow packages versioned
  shared/      # Shared constants/types (vd: IPC channels)
```

Rule import quan trong:
- Renderer KHONG import truc tiep main, chi qua IPC.
- Core giu vai tro contract/engine chung.
- Main la noi glue core + DB + external systems.

## 2.3 Entry points quan trong

- Main boot: `src/main/index.ts`
- Renderer root: `src/renderer/App.tsx`
- IPC bridge: `src/preload/index.ts`
- Engine: `src/core/engine/FlowEngine.ts`

## 2.4 Thu muc `nodes/` (node da co)

```text
src/nodes/
  campaign-finish/      -> id: core.campaign_finish
  caption-generator/    -> id: core.caption_gen
  condition/            -> id: core.condition
  file-source/          -> id: core.file_source
  item-limit/           -> id: core.item_limit
  join/                 -> id: core.join (from src/core/nodes/JoinNode.ts)
  js-runner/            -> id: core.js_runner
  media-downloader/     -> id: core.media_downloader
  parallel/             -> id: core.parallel (from src/core/nodes/ParallelNode.ts)
  publish-scheduler/    -> id: core.publish_scheduler
  quality-gate/         -> id: core.quality_gate
  skip-processed/       -> id: core.skip_processed
  source-watcher/       -> id: core.source_watcher
  tiktok-account-dedup/ -> id: tiktok.account_dedup
  tiktok-publisher/     -> id: tiktok.publisher
  tiktok-scanner/       -> id: tiktok.scanner
  time-gate/            -> id: core.time_gate
  timeout/              -> id: core.timeout
  video-edit/           -> id: core.video_edit
```

Auto discovery node:
- File: `src/nodes/index.ts`
- Rule: scan `src/nodes/**/index.ts`, lay `default export` la `NodeDefinition`, register vao `nodeRegistry`.

## 2.5 Thu muc `workflows/`

```text
src/workflows/
  index.ts                # Auto-discovery workflow modules
  tiktok-repost/
    v1.0/
      flow.yaml
      wizard.ts
      recovery.ts
      ipc.ts
      services.ts
      events.ts
      lifecycle.ts
      card.tsx
      detail.tsx
      troubleshooting/
  upload-local/
    v1.0/
      flow.yaml
      wizard.tsx
      recovery.ts
      detail.tsx
      troubleshooting/
```

Auto discovery workflow (file `src/workflows/index.ts`):
- `./*/v*/recovery.ts`
- `./*/v*/ipc.ts`
- `./*/v*/services.ts`
- `./*/v*/events.ts`
- `./*/v*/lifecycle.ts`

Wizard auto discovery:
- File: `src/renderer/wizard/workflowWizardRegistry.ts`
- Pattern: `../../workflows/*/v*/wizard.{ts,tsx}`

---

## 3) Cach viet `flow.yaml` (chi tiet)

## 3.1 Top-level schema

`flow.yaml` parse boi `FlowLoader` (`src/core/flow/FlowLoader.ts`).

Field bat buoc:
- `id`
- `name`
- `nodes`
- `edges`

Field thuong dung:
- `description`
- `icon`
- `color`
- `version`
- `health_checks` (list endpoint monitor)
- `ui` (optional descriptor cho renderer)

## 3.2 Schema `nodes[]`

Moi node trong `nodes[]` co format:

```yaml
- node_id: core.time_gate
  instance_id: start_gate
  params: {}                # optional, merge vao ctx.params khi run node
  children: []              # optional, cho loop/parallel
  on_error: skip            # optional: skip | stop_campaign | retry
  timeout: 30000            # optional, ms
  events:                   # optional, map event-key -> action
    captcha:detected:
      action: pause_campaign
      emit: campaign:needs_captcha
```

Y nghia field:
- `node_id`: map voi `manifest.id` cua node.
- `instance_id`: id duy nhat trong 1 flow.
- `params`: param rieng cho node; engine merge voi campaign params.
- `children`:
  - voi `core.parallel`: danh sach branch.
  - voi node khac co children: engine xem la loop.
- `on_error`: hien tai dung ro nhat trong child loop.
- `timeout`: engine race Promise voi timeout.
- `events`: match message loi -> action (`skip_item`, `pause_campaign`, `stop_campaign`) + optional event emit.

## 3.3 Schema `edges[]`

```yaml
- from: scanner_1
  to: scheduler_1
  when: "branch === 'true'"   # optional JS expression
```

- `from`, `to` la `instance_id`.
- `when` la bieu thuc JS, eval tren `result.data` cua node truoc.

## 3.4 Flow mau toi thieu (copy-paste)

```yaml
id: demo-workflow
name: Demo Workflow
version: "1.0"

nodes:
  - node_id: core.file_source
    instance_id: source_1

  - node_id: core.loop
    instance_id: loop_1
    children:
      - caption_1
      - publisher_1

  - node_id: core.caption_gen
    instance_id: caption_1

  - node_id: tiktok.publisher
    instance_id: publisher_1
    on_error: skip

edges:
  - from: source_1
    to: loop_1
```

Luu y quan trong:
- `core.loop` la virtual node pattern trong engine (khong can node implementation rieng).
- Node co `children` (khong phai `core.parallel`) se duoc engine xu ly theo loop path.

## 3.5 Flow parallel/join mau (copy-paste)

```yaml
id: demo-parallel
name: Demo Parallel
version: "1.0"

nodes:
  - node_id: core.file_source
    instance_id: source_1

  - node_id: core.parallel
    instance_id: fork_1
    children:
      - branch_a
      - branch_b

  - node_id: core.js_runner
    instance_id: branch_a

  - node_id: core.js_runner
    instance_id: branch_b

  - node_id: core.join
    instance_id: join_1
    params:
      branches: [branch_a, branch_b]
      mode: all
      onBranchFail: continue

  - node_id: core.campaign_finish
    instance_id: finish_1

edges:
  - from: source_1
    to: fork_1
  - from: fork_1
    to: join_1
  - from: join_1
    to: finish_1
```

---

## 4) Cach lam node moi (step-by-step)

## 4.1 Tao folder va files

Tao:

```text
src/nodes/my-node/
  index.ts
  backend.ts
```

## 4.2 `index.ts` template

```ts
import type { NodeDefinition, NodeManifest } from '@core/nodes/NodeDefinition'
import { execute } from './backend'

const manifest: NodeManifest = {
  id: 'core.my_node',
  name: 'My Node',
  label: 'MyNode',
  color: '#3b82f6',
  category: 'transform',
  icon: 'M',
  description: 'Do something useful',
  retryPolicy: {
    maxRetries: 2,
    backoff: 'exponential',
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    retryableErrors: ['timeout', 'ECONNRESET'],
  },
}

const node: NodeDefinition = { manifest, execute }
export default node
```

## 4.3 `backend.ts` template

```ts
import type { NodeExecutionContext, NodeExecutionResult } from '@core/nodes/NodeDefinition'
import { failGracefully } from '@core/nodes/NodeHelpers'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  try {
    ctx.onProgress('my-node started')

    if (!input) {
      return failGracefully(
        ctx,
        'my_node_1',
        'unknown',
        'invalid_input',
        'Input is empty',
        { errorCode: 'DG-000' },
      )
    }

    const output = { ...input, processedBy: 'core.my_node' }
    return { action: 'continue', data: output }
  } catch (err: any) {
    // Fatal path: throw de engine handle retryPolicy
    throw err
  }
}
```

## 4.4 Gan node vao flow

Trong `flow.yaml`:

```yaml
- node_id: core.my_node
  instance_id: my_node_1
```

## 4.5 Kiem tra node da duoc load

1. Chay `npm run dev`
2. Xem console main process, NodeRegistry se auto discover.
3. Trigger campaign co su dung node moi.
4. Xem `node:status`, `node:progress`, `execution:log` trong UI.

## 4.6 Checklist node moi

- `manifest.id` unique
- `instance_id` unique trong flow
- return dung contract `{ data, action? }`
- retryPolicy phu hop
- loi recoverable dung `failGracefully`/`failBatchGracefully`
- loi domain co ma DG-xxx neu can

---

## 5) Cach lam workflow moi (step-by-step)

## 5.1 Tao folder workflow versioned

```text
src/workflows/my-workflow/v1.0/
  flow.yaml
  wizard.tsx
  recovery.ts
  ipc.ts
  services.ts
  events.ts
  lifecycle.ts
  detail.tsx
  card.tsx
```

Bat buoc toi thieu de chay duoc:
- `flow.yaml`
- `wizard.ts` hoac `wizard.tsx`
- `recovery.ts` (nen co de crash recovery ro rang)

Optional:
- `ipc.ts`, `services.ts`, `events.ts`, `lifecycle.ts`, `detail.tsx`, `card.tsx`

## 5.2 `flow.yaml` cho workflow moi

Yeu cau:
- `id` trung voi workflow id folder (vd `my-workflow`)
- `version` trung convention folder (`v1.0` -> `"1.0"`)
- Node ids phai ton tai trong NodeRegistry

## 5.3 `wizard.tsx` template

```ts
import type { WizardStepConfig } from '@renderer/wizard/WizardStepTypes'
import { WizardTarget } from '@renderer/components/wizard/WizardTarget'

function StepA({ data, updateData }: any) {
  return null
}

export const myWorkflowSteps: WizardStepConfig[] = [
  {
    id: 'setup',
    title: 'Setup',
    icon: 'S',
    description: 'Basic config',
    component: StepA,
    validate: (data) => (!data?.name ? 'Name is required' : null),
  },
  {
    id: 'target',
    title: 'Target',
    icon: 'T',
    description: 'Select publish accounts',
    component: WizardTarget,
    validate: (data) => ((data.publishAccountIds || []).length ? null : 'Select at least one account'),
  },
]
```

## 5.4 `recovery.ts` template

```ts
import { jobRepo } from '@main/db/repositories/JobRepo'
import { flowEngine } from '@core/engine/FlowEngine'

export function recover(campaignId: string): void {
  const pending = jobRepo.countPendingForCampaign(campaignId)
  if (pending === 0) {
    flowEngine.resumeCampaign(campaignId)
  }
}
```

## 5.5 `lifecycle.ts` template (optional)

```ts
import type { WorkflowLifecycle } from '@core/flow/WorkflowLifecycle'

const lifecycle: WorkflowLifecycle = {
  async beforeStart(_campaignId, _params) {
    return { ok: true, errors: [] }
  },
  async onDelete(_campaignId, _params) {
    // cleanup files/resources if needed
  },
}

export default lifecycle
```

## 5.6 `ipc.ts` template (optional)

```ts
import { ipcMain } from 'electron'

export function setup() {
  ipcMain.removeHandler('my-workflow:ping')
  ipcMain.handle('my-workflow:ping', async () => ({ ok: true }))
}
```

## 5.7 Verify workflow moi da duoc load

1. Chay `npm run dev`
2. Main console se log auto-discovered workflow modules.
3. UI workflow picker (`flow:get-presets`) thay workflow moi.
4. Mo wizard va tao campaign thanh cong.
5. Trigger campaign va theo doi node logs.

## 5.8 Versioning workflow dung cach

Khi breaking change flow/params:
1. Tao folder moi: `v1.1` hoac `v2.0`
2. Copy file can thiet tu version cu
3. Chinh sua flow/wizard theo requirement moi
4. Khong sua campaign cu: vi da pin `flow_snapshot`

---

## 6) Runtime contracts quan trong

## 6.1 Node execution contract

`execute(input, ctx)` phai tra:
- `data`: payload cho node tiep theo
- `action` optional: `continue | recall | finish | wait`

## 6.2 Event/Log contract

Nguon chinh: `ExecutionLogger`

UI dang consume cac event:
- `node:status`
- `node:progress`
- `node:event`
- `execution:log`
- `execution:node-data`
- `campaigns-updated`

## 6.3 Locking

- `CampaignPipelineLock`: 1 campaign tranh double execution
- `EntityLock`: khoa theo entity/video trong loop

---

## 7) Testing + verify sau khi sua

Lenh co ban:

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
```

Run 1 case:

```powershell
$env:UNIT_CASE_ID='unit.troubleshooting.grouping.suite-and-group-order'
npm run test:unit
```

Smoke checklist cho thay doi flow/node/workflow:
1. Tao campaign moi thanh cong
2. Trigger campaign tao jobs dung start node
3. Node moi co `node:start`, `node:end` hoac `node:error`
4. UI thay `node:progress` neu node phat progress
5. Pause/Resume khong gay race lock

---

## 8) Loi thuong gap

1. Sua `flow.yaml` roi test tren campaign cu -> khong thay doi vi campaign dung snapshot cu.
2. Quen unique `instance_id` trong flow.
3. Dung `node_id` khong ton tai trong NodeRegistry.
4. Quen `ipcMain.removeHandler()` trong `ipc.ts` -> hot reload bi duplicate handler.
5. Throw loi khong ro context, khong co ma DG cho loi domain quan trong.

---

## 9) File can nho

- `src/main/index.ts`
- `src/core/engine/FlowEngine.ts`
- `src/core/flow/FlowLoader.ts`
- `src/core/flow/ExecutionContracts.ts`
- `src/core/nodes/NodeDefinition.ts`
- `src/core/nodes/NodeHelpers.ts`
- `src/nodes/index.ts`
- `src/workflows/index.ts`
- `src/renderer/wizard/workflowWizardRegistry.ts`
- `src/shared/ipc-types.ts`
- `src/main/db/Database.ts`

Ban co the bat dau task dau tien bang cach:
1. Tao 1 node `core.my_node`
2. Gan vao `upload-local/v1.0/flow.yaml`
3. Tao campaign moi va verify log/event trong UI

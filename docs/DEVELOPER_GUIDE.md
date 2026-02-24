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
│   ├── tiktok-scanner/      # Each node = folder with manifest + backend
│   ├── video-downloader/
│   ├── deduplicator/
│   └── ...
├── workflows/               # Workflow definitions (auto-discovered)
│   ├── tiktok-repost/       # Each workflow = folder with all related files
│   │   ├── flow.yaml        # Pipeline definition + UI config
│   │   ├── wizard.ts        # Wizard step configuration
│   │   ├── detail.tsx       # Campaign detail view + state
│   │   └── card.tsx         # Campaign list card component
│   └── upload-local/
├── renderer/src/            # React frontend
│   ├── detail/
│   │   └── WorkflowDetailRegistry.ts  # Auto-discovers detail.tsx
│   ├── wizard/
│   │   └── workflowWizardRegistry.ts  # Auto-discovers wizard.ts
│   └── components/
│       ├── CampaignCard.tsx  # Auto-discovers card.tsx per workflow
│       └── CampaignDetail.tsx
└── main/                    # Electron main process
    ├── ipc/                 # IPC handlers
    └── db/                  # SQLite database
```

---

## How to Write a Node

### 1. Create the folder

```
src/nodes/my-node/
├── manifest.ts    # Node metadata
├── backend.ts     # Execution logic
└── index.ts       # Entry point (combines manifest + backend)
```

### 2. manifest.ts

```typescript
export const manifest = {
  id: 'my-namespace.my-node',  // Unique ID: namespace.name
  name: 'My Node',
  description: 'What this node does',
  category: 'processing',
  inputs: ['video'],           // What data types this node accepts
  outputs: ['video'],          // What data types this node produces
}
```

### 3. backend.ts

```typescript
import { NodeExecutionContext, NodeExecutionResult } from '../../core/nodes/NodeDefinition'

export async function execute(input: any, ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
  // input: data from previous node in the pipeline
  // ctx.params: campaign parameters (from wizard)
  // ctx.campaign_id: current campaign ID
  // ctx.logger.info('message')  — logs to execution_logs table
  // ctx.logger.error('message', err)
  // ctx.onProgress('message')   — shows in UI

  // Do your work here
  ctx.onProgress('Processing...')
  const result = doSomething(input)

  // Return result
  return {
    data: result,            // Passed to next node as input
    action: 'continue',     // 'continue' (default) | 'finish' (stop campaign) | 'recall' (jump to node)
    message: 'Done',        // Optional status message
  }
}
```

### 4. index.ts

```typescript
import { manifest } from './manifest'
import { execute } from './backend'

export default { manifest, execute }
```

### Key Rules
- **Input/Output contract**: Your node receives `input` from the previous node. Return `{ data }` for the next node.
- **Return `null` data** to skip this item (e.g., dedup node returns `{ data: null, action: 'continue' }`).
- **Throw errors** for failures — the engine catches them and handles via `on_error` config.
- **Use `ctx.logger`** for logging, NOT `console.log`. Logs go to DB and are visible in the UI.
- **Auto-discovery**: Just create the folder. The node is auto-registered via `import.meta.glob`.

---

## How to Write a Workflow

### 1. Create the workflow folder

```
src/workflows/my-workflow/
├── flow.yaml      # Required: pipeline definition
├── wizard.ts      # Optional: wizard step configuration
├── detail.tsx     # Optional: custom detail view
└── card.tsx       # Optional: custom campaign card
```

### 2. flow.yaml — Pipeline Definition

```yaml
# Metadata
id: my-workflow
name: My Workflow
description: What this workflow does
icon: 🔧
color: "#8b5cf6"
version: "1.0"

# Pipeline nodes
nodes:
  - node_id: my-namespace.scanner    # References a node from src/nodes/
    instance_id: scanner_1           # Unique instance name within this flow

  - node_id: core.loop               # Loop node — processes items one by one
    instance_id: video_loop
    children: [processor_1, publisher_1, timeout_1]  # Children run sequentially per item

  - node_id: my-namespace.processor
    instance_id: processor_1
    on_error: stop_campaign           # 'skip' (default) | 'stop_campaign'

  - node_id: my-namespace.publisher
    instance_id: publisher_1

  - node_id: core.timeout
    instance_id: timeout_1

# Edges: connect nodes (top-level only, children are in-order)
edges:
  - from: scanner_1
    to: video_loop

# UI configuration (drives campaign cards and detail page)
ui:
  campaign_card:
    stats: [...]
    status_badges: [...]
  card_actions: [...]
  detail_page:
    header_actions: [...]
    header_stats: [...]
```

### 3. wizard.ts — Wizard Steps

```typescript
import { WizardStepConfig } from '@renderer/wizard/WizardStepTypes'
import SomeStepComponent from '@renderer/wizard/shared/SomeStep'

const steps: WizardStepConfig[] = [
  {
    id: 'details',
    title: 'Details',
    icon: '📝',
    component: SomeStepComponent,
  },
  // ... more steps
]

export default steps
```

### 4. detail.tsx — Custom Detail View

```tsx
import type { WorkflowDetailProps } from '@renderer/detail/WorkflowDetailRegistry'
import { PipelineVisualizer } from '@renderer/detail/shared/PipelineVisualizer'

function MyWorkflowDetail({ campaignId, campaign, workflowId }: WorkflowDetailProps) {
  // Own your state here — fetch logs, build video lists, etc.
  return (
    <div>
      <PipelineVisualizer campaignId={campaignId} workflowId={workflowId} />
      {/* Your custom UI */}
    </div>
  )
}

export default MyWorkflowDetail
```

### 5. card.tsx — Custom Campaign Card

```tsx
interface CardProps {
  campaign: any
  onAction: (event: string, payload: any) => void
}

export default function MyWorkflowCard({ campaign, onAction }: CardProps) {
  return (
    <div>
      <h3>{campaign.name}</h3>
      <button onClick={() => onAction('campaign:trigger', { id: campaign.id })}>
        Run
      </button>
    </div>
  )
}
```

---

## System Flow

```
1. User creates campaign via Wizard
   └─> campaign:create IPC → saves to DB with workflow_id + params

2. User clicks "Run" on campaign card
   └─> campaign:trigger IPC → FlowEngine.triggerCampaign()

3. FlowEngine loads flow.yaml, finds first node, creates a Job
   └─> Job saved to `jobs` table with status='pending'

4. FlowEngine.tick() polls pending jobs every 500ms
   └─> Picks up job → executes node → logs to execution_logs

5. For LOOP nodes:
   └─> Receives array of items from previous node
   └─> For each item: runs children sequentially (dedup → download → caption → publish → timeout)
   └─> Checks campaign status between items (supports pause)
   └─> Per-node on_error: 'skip' continues to next item, 'stop_campaign' stops everything

6. UI updates via:
   └─> Polling: campaign list refreshes every 3s
   └─> IPC events: execution:node-data, node:progress sent to renderer
   └─> Detail view rebuilds state from execution_logs
```

---

## Error Handling

### Per-Node `on_error` Config
```yaml
nodes:
  - node_id: tiktok.publisher
    instance_id: publisher_1
    on_error: stop_campaign    # Stop entire campaign if this node fails
```

Options:
- `skip` (default): Skip the current item, continue to next
- `stop_campaign`: Set campaign status to 'error' and stop

### Input Validation
The engine validates input before each node execution. If a node receives `null` input, it logs an error and skips to the next item.

---

## IPC Event Names

| Event | Direction | Description |
|-------|-----------|-------------|
| `campaign:list` | renderer → main | List all campaigns |
| `campaign:get` | renderer → main | Get single campaign |
| `campaign:create` | renderer → main | Create campaign |
| `campaign:trigger` | renderer → main | Start/run campaign |
| `campaign:pause` | renderer → main | Pause campaign |
| `campaign:resume` | renderer → main | Resume campaign |
| `campaign:delete` | renderer → main | Delete campaign |
| `campaign:get-jobs` | renderer → main | Get jobs for campaign |
| `campaign:get-logs` | renderer → main | Get execution logs |
| `campaign:get-flow-nodes` | renderer → main | Get flow definition |
| `flow:get-ui-descriptor` | renderer → main | Get UI config from flow.yaml |
| `flow:get-presets` | renderer → main | List available workflows |

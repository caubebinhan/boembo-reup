# Debug Casebook: upload-local@1.0

- Implemented cases (JSON): **0**
- TODO cases (Markdown): **1**
- Generated at: 2026-03-03T08:18:07.206Z

## Group Breakdown

| Group | Implemented | TODO |
|---|---:|---:|
| smoke | 0 | 1 |

## TODO Queue

### upload-local-v1.workflow-smoke
- Title: Upload Local v1 Smoke (Planned)
- Group: smoke | Category: smoke | Level: basic
- Code: `case-UPLOAD-01`
- Source: `src/workflows/upload-local/v1.0/troubleshooting/cases/index.ts`
- TODO: Implement runner branch and wire caseId dispatch.
- TODO: Add deterministic fixture/setup for reproducible debug reruns.
- TODO: Assert DB/UI/log/event checks from case meta.
- TODO: Attach artifact outputs + diagnostic footprint for investigation.
- TODO: Flip implemented=true after validation in Debug tab.

## Implemented JSON Layout

- Implemented cases are split by group and written as one JSON file per case.
- Path pattern: `groups/<group>/cases/<case-id>.json`


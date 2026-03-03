# Debug Test Hub

This folder is the single hub for debug/test investigation assets:

- `CASE_INDEX.json`: root summary index (implemented JSON only + workflow paths).
- `CASEBOOK.md`: root TODO backlog (markdown only).
- `WORKFLOW_INDEX.json`: workflow/version map.
- `workflows/<workflowId>/<version>/CASE_INDEX.json`: per-workflow summary.
- `workflows/<workflowId>/<version>/CASEBOOK.md`: per-workflow TODO queue.
- `workflows/<workflowId>/<version>/groups/<group>/CASE_INDEX.json`: per-group implemented index.
- `workflows/<workflowId>/<version>/groups/<group>/cases/<case-id>.json`: one file per implemented case.
- `workflows/<workflowId>/<version>/groups/<group>/TODO.md`: TODO/planned cases for that group.
- `EXCEPTION_MATRIX.md`: proposed extra edge/exception scenarios to convert into cases.

Runtime outputs are separated from this catalog:

- `.debug-runtime/artifacts/`: archived artifact bundles per run (`artifact-manifest.json`, screenshots, HTML dumps, logs, JSON snapshots).
- `.debug-runtime/footprints/`: diagnostic footprint JSON exported per run.
- `.debug-runtime/runs/`: reserved for exported run snapshots.

Cross-platform notes:

- Debug test fixtures now detect runtime platform/arch automatically (`windows`, `macos-intel`, `macos-apple-silicon`, etc.).
- Avoid hardcoding `C:\\...` paths in new cases; derive paths from runtime flavor.

## Regenerate Index

```powershell
npm run debug:casebook
```

## Execute Tests

```powershell
npm run test:unit
npm run test:e2e
```

Single-case runs:

```powershell
$env:UNIT_CASE_ID='unit.troubleshooting.grouping.suite-and-group-order'
npm run test:unit

$env:TEST_CASE_ID='e2e.troubleshooting.suites.grouping-visible'
npm run test:e2e
```

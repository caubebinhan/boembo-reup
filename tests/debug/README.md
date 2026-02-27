# Debug Test Hub

This folder is the single hub for debug/test investigation assets:

- `CASE_INDEX.json`: machine-readable index for all cases and TODO items.
- `CASEBOOK.md`: human-readable implementation backlog grouped by scope.
- `WORKFLOW_INDEX.json`: workflow/version map to split case indexes.
- `workflows/<workflowId>/<version>/CASE_INDEX.json`: per-workflow case index.
- `workflows/<workflowId>/<version>/CASEBOOK.md`: per-workflow implementation queue.
- `EXCEPTION_MATRIX.md`: proposed extra edge/exception scenarios to convert into cases.
- `artifacts/`: archived artifact bundles per run (`artifact-manifest.json`, screenshots, HTML dumps, logs, JSON snapshots).
- `footprints/`: diagnostic footprint JSON exported per run.
- `runs/`: reserved for exported run snapshots.

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

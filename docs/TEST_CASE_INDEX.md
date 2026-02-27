# Test Case Index

This project now keeps test cases in per-case files with explicit `id`, `group`, and `meta` so failed cases can be investigated one-by-one.

Debug casebook hub:

- `tests/debug/CASEBOOK.md`
- `tests/debug/CASE_INDEX.json`
- `tests/debug/EXCEPTION_MATRIX.md`

## Unit Cases

Index entrypoint: `tests/unit/debug/cases/unit/index.ts`
Current count: **6**

Case IDs:

- `unit.troubleshooting.suite-classification.real-publish-is-e2e`
- `unit.troubleshooting.suite-classification.static-analysis-is-unit`
- `unit.troubleshooting.suite-classification.db-is-integration`
- `unit.troubleshooting.grouping.suite-and-group-order`
- `unit.troubleshooting.artifact-view.screenshot-path-renders-image`
- `unit.troubleshooting.artifact-view.data-url-renders-image`

Run one unit case:

```powershell
$env:UNIT_CASE_ID='unit.troubleshooting.grouping.suite-and-group-order'
npm run test:unit
```

## E2E Cases

Index entrypoint: `tests/e2e/cases/index.mjs`
Current count: **3**

Case IDs:

- `e2e.troubleshooting.suites.grouping-visible`
- `e2e.troubleshooting.artifact.screenshot-preview-visible`
- `e2e.troubleshooting.sentry.feedback-links-visible`

Run one e2e case:

```powershell
$env:TEST_CASE_ID='e2e.troubleshooting.artifact.screenshot-preview-visible'
npm run test:e2e
```

Run e2e with visible browser:

```powershell
$env:E2E_HEADLESS='0'
npm run test:e2e
```

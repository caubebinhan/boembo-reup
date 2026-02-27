# Exception Matrix (Proposed)

Backlog of additional edge/exception scenarios not yet registered as runnable troubleshooting cases.

| Case ID (proposal) | Area | Exception | Artifact focus | TODO |
|---|---|---|---|---|
| `tiktok-repost-v1.engine.preflight.storage-low` | engine | Free disk `<100MB` before trigger | health-check payload, logs | Add runner + block campaign assert |
| `tiktok-repost-v1.engine.preflight.service-timeout` | engine | Workflow health URL timeout | network trace, event log | Assert `campaign:healthcheck-failed` |
| `tiktok-repost-v1.engine.network-auto-pause` | engine | Node throws network error | node:event tail, campaign status | Assert auto pause behavior |
| `tiktok-repost-v1.engine.disk-fatal-stop` | engine | Node throws disk/full error | error logs, campaign snapshot | Assert fatal error behavior |
| `tiktok-repost-v1.loop.child-timeout-event-map` | loop/events | Loop child timeout matched by `events:` key | job logs, emitted event | Verify `pause_campaign`/`stop_campaign` map |
| `tiktok-repost-v1.loop.on-error-retry-unimplemented` | loop/error-policy | `on_error=retry` declared but runtime gap | execution logs, branch trace | Add regression guard + docs |
| `tiktok-repost-v1.scheduler.time-range-cross-midnight` | scheduler | Time range spans midnight | scheduled list snapshot | Validate next-slot calculation |
| `tiktok-repost-v1.scheduler.dst-boundary` | scheduler | DST jump affects schedule intervals | before/after schedule JSON | Validate no duplicate/missing slots |
| `tiktok-repost-v1.publisher.upload-selector-shift` | publisher | Upload selector changed/drifted | screenshot + html dump | Ensure actionable failure diagnostics |
| `tiktok-repost-v1.publisher.post-submit-interrupt` | publisher | Navigation interrupted after submit | session log checkpoints | Verify retry/recheck fallback |
| `tiktok-repost-v1.publisher.cookie-domain-mismatch` | publisher/auth | Cookies exist but wrong domain scope | cookie snapshot, redirect URL | Explicit auth failure classification |
| `tiktok-repost-v1.publisher.partial-artifacts-missing` | publisher/artifacts | Some debug artifacts missing path | artifact manifest | Ensure UI still inspectable |
| `tiktok-repost-v1.db.settings-json-corrupt` | db | Corrupted settings payload | db snapshot, parse error log | Fail gracefully + preserve app boot |
| `tiktok-repost-v1.db.campaign-json-corrupt` | db | Corrupted campaign document | db snapshot, case footprint | Ensure isolation of bad row |
| `tiktok-repost-v1.db.publish-history-index-drift` | db | Missing index hurts dedup perf | schema report, query timing | Add schema drift alarm |
| `tiktok-repost-v1.async-task.requeue-after-crash` | async verify | Worker crash mid-attempt | async task row timeline | Verify reclaim + no duplicate run |
| `tiktok-repost-v1.async-task.max-retry-backoff` | async verify | Backoff exceeds expected window | task metadata, logs | Validate cap and metadata visibility |
| `main.ui.case-filter-large-catalog` | debug tab/ui | 100+ cases with filters/tags | screenshot, UI perf metrics | Validate filter responsiveness |
| `main.ui.run-log-cap-rotation` | debug tab/ui | Log lines exceed cap (5000) | run payload, log stats | Verify capped display correctness |
| `main.sentry.strict-verify-timeout` | sentry | Send success but verify timeout | sentry payload, verify response | Assert strict-mode failure surface |
| `main.sentry.invalid-dsn-routing` | sentry | Channel DSN missing/invalid | send result + error text | Ensure explicit route-level errors |
| `main.artifact.non-image-binary` | debug tab/artifacts | Artifact is binary/non-previewable | artifact manifest entry | Render safe fallback preview |
| `main.artifact.path-permission-denied` | debug tab/artifacts | Path exists but unreadable | file meta + error | Keep run inspectable with warnings |
| `main.case-id-duplicate-guard` | catalog | Duplicate case ID from providers | discovery logs | Ensure warning + deterministic listing |

## Notes

- Convert each proposal into `TroubleshootingCaseDefinition` with `implemented: false` before implementation.
- Keep deterministic fingerprint format: `case-<sha1(seed)[:16]>`.
- Require artifact manifest + footprint export for each failure path.

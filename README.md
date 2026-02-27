# repost-io

Electron + React + TypeScript app for workflow-driven repost automation.

## 1) Prerequisites

1. Node.js 20+ and npm
2. Windows/macOS/Linux with browser dependencies for Playwright
3. Sentry org access for observability setup

## 2) Install

```bash
npm install
```

## 3) Environment setup

1. Copy `.env.example` to `.env.local`
2. Fill all required keys
3. Keep `.env.local` local only (already ignored by `.gitignore`)

Minimum keys for built-in routing:

```dotenv
SENTRY_PRODUCTION_DSN=...
VITE_SENTRY_DSN_PRODUCTION=...
SENTRY_STAGING_DSN=...
SENTRY_STAGING_AUTH_TOKEN=...    # required for strict verify
SENTRY_STAGING_ORG=bombo-automation
SENTRY_STAGING_PROJECT=boembo-repost-staging
SENTRY_STAGING_VERIFY_REQUIRED=1
```

For one-click in-app Sentry connect:

```dotenv
SENTRY_OAUTH_CLIENT_ID=...
SENTRY_OAUTH_SCOPE=org:read project:read event:read
```

Get `SENTRY_OAUTH_CLIENT_ID` from Sentry dashboard menu:

1. Org `Settings` -> `Custom Integrations`
2. `Create New Integration`
3. Select `Public Integration`
4. Set required scopes: `org:read`, `project:read`, `event:read`
5. Save and copy `Client ID`

## 4) Sentry setup (menu-first, link is fallback)

### Routing policy in this app

1. Runtime errors from app (main + renderer) -> production project
2. Debug tab `Send To Sentry` -> staging project + API verification

### Create/confirm projects from dashboard menu

1. Open Sentry org `bombo-automation`
2. Left menu -> `Settings` -> `Projects`
3. Confirm production slug: `bombo-repost`
4. Confirm staging slug: `boembo-repost-staging`
5. If missing: `Create Project` -> Platform `Electron` -> Team `bombo-automation`

### Copy DSN from dashboard menu

1. Left menu -> `Settings` -> `Projects` -> open project
2. Open `Client Keys (DSN)`
3. Copy Public DSN
4. Put production DSN to `SENTRY_PRODUCTION_DSN` / `VITE_SENTRY_DSN_PRODUCTION`
5. Put staging DSN to `SENTRY_STAGING_DSN`

### Create token for debug verification

1. User menu (top-right avatar) -> `API` -> `Auth Tokens`
2. Create personal token for debug verification
3. Required scopes: `org:read`, `project:read`, `event:read`
4. Put token to `SENTRY_STAGING_AUTH_TOKEN`
5. Use this only for manual env mode. If you use `Connect Sentry` in app, token is obtained automatically.

### Optional: one-click `Connect Sentry` inside app

1. Open app -> `Settings` -> `Browser & Automation` -> `Sentry Connect`
2. Click `Connect Sentry`
3. Browser opens Sentry authorize screen
4. Approve access
5. Return app and wait for status `Connected`
6. Choose `Production Project` and `Staging Project`
7. Click `Save Project Mapping`
8. App auto-uses connected token/DSN for Debug tab send/verify when env is not set

## 5) Development

```bash
npm run dev
```

## 6) Build

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

## 7) Database operations

DB path is controlled by `REPOST_IO_DB_PATH` or defaults to Electron userData.

### In app UI

1. Open `Settings` tab
2. Go to `Storage`
3. In `Danger Zone`
4. Click `Check Schema` to inspect drift/missing indexes
5. Click `Clean Schema` to drop all tables and recreate schema

Notes:

1. `Clean Schema` deletes campaigns/jobs/logs/publish history/settings
2. Browser sessions are closed before schema clean

## 8) Testing

This repo runs tests with isolated SQLite DB files under `.test-db/`.

```bash
npm run test:unit
npm run test:e2e
```

Run one test case:

```powershell
$env:UNIT_CASE_ID='unit.troubleshooting.grouping.suite-and-group-order'
npm run test:unit

$env:TEST_CASE_ID='e2e.troubleshooting.sentry.feedback-links-visible'
npm run test:e2e
```

Run e2e with visible browser:

```powershell
$env:E2E_HEADLESS='0'
npm run test:e2e
```

Case index and grouping rules:

1. `docs/TEST_CASE_INDEX.md`

## 9) Debug workflow with Sentry (required pass criteria)

1. Open app `Debug` tab
2. Run a troubleshooting case
3. Select run result
4. Click `Send To Sentry`
5. Pass only when verification shows success (strict mode on)
6. Use `Open Sentry Event` from UI as evidence

If strict mode is enabled (`SENTRY_STAGING_VERIFY_REQUIRED=1`), send is failed when event cannot be verified before timeout.

## 10) Internal docs order (primary source)

1. `docs/SENTRY_STAGING_VERIFICATION.md` for Sentry operation runbook
2. `docs/TEST_CASE_INDEX.md` for per-case ID execution and grouping
3. `docs/DEVELOPER_GUIDE.md` for architecture, DB, IPC, and execution flow

## 11) Fallback links (only when menu path is unclear)

1. Electron SDK docs: https://docs.sentry.io/platforms/javascript/guides/electron/
2. DSN explainer: https://docs.sentry.io/concepts/key-terms/dsn-explainer/
3. Auth token guide: https://docs.sentry.io/api/guides/create-auth-token/
4. Integration platform docs: https://docs.sentry.io/product/integrations/integration-platform/

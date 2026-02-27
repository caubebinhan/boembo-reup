# Sentry Runbook (Production + Debug Staging)

## 1) Routing rule

1. App runtime errors (main + renderer) -> production project
2. Debug tab `Send To Sentry` -> staging project
3. Debug send is pass only when event verification succeeds if strict mode is on

## 2) Verified org/project mapping (current)

1. Org slug: `bombo-automation`
2. Production project slug: `bombo-repost`
3. Staging project slug: `boembo-repost-staging`

Important:

1. `bombo-repost-staging` is not the active slug in this workspace
2. Use exact slug `boembo-repost-staging` in `.env.local`

## 3) Dashboard navigation (menu-first)

### A. Create/confirm projects

1. Open Sentry and switch to org `bombo-automation`
2. Left menu -> `Settings` -> `Projects`
3. Confirm `bombo-repost` exists for production
4. Confirm `boembo-repost-staging` exists for staging
5. If missing, create project:
6. Platform `Electron`
7. Team `bombo-automation`
8. Keep slug exactly as configured in env

### B. Copy DSN

1. Left menu -> `Settings` -> `Projects` -> choose target project
2. Open `Client Keys (DSN)`
3. Copy Public DSN
4. Fill env:
5. Production DSN -> `SENTRY_PRODUCTION_DSN` and `VITE_SENTRY_DSN_PRODUCTION`
6. Staging DSN -> `SENTRY_STAGING_DSN`

### C. Manual API token for staging verification (fallback)

1. Top-right avatar menu -> `API` -> `Auth Tokens`
2. Create personal token for verification
3. Required scopes: `org:read`, `project:read`, `event:read`
4. Put token to `SENTRY_STAGING_AUTH_TOKEN`
5. Skip this section if you use OAuth `Connect Sentry` in app

### D. Optional OAuth app for one-click connect in desktop app

1. In org dashboard open `Settings` -> `Custom Integrations`
2. Click `Create New Integration`
3. Select `Public Integration`
4. In integration scopes include `org:read`, `project:read`, `event:read`
5. Save integration and copy OAuth `client_id`
6. Set runtime env `SENTRY_OAUTH_CLIENT_ID`
7. Open app `Settings -> Browser & Automation -> Sentry Connect`
8. Click `Connect Sentry`
9. Complete browser authorization and return to app
10. Choose production/staging project mapping and save

## 4) `.env.local` required keys

### Production reporting

```dotenv
SENTRY_PRODUCTION_DSN=...
VITE_SENTRY_DSN_PRODUCTION=...
VITE_SENTRY_DSN=...
SENTRY_ENVIRONMENT=production
VITE_SENTRY_ENVIRONMENT=production
```

### Debug tab -> staging send + verify

```dotenv
SENTRY_STAGING_DSN=...
SENTRY_STAGING_AUTH_TOKEN=...
SENTRY_STAGING_ORG=bombo-automation
SENTRY_STAGING_PROJECT=boembo-repost-staging
SENTRY_STAGING_BASE_URL=https://sentry.io
SENTRY_STAGING_VERIFY_REQUIRED=1
SENTRY_STAGING_VERIFY_TIMEOUT_MS=45000
SENTRY_STAGING_VERIFY_POLL_MS=2500
```

When OAuth connect is active, app can auto-fill staging token/DSN/org/project from connected account if env keys are missing.

### Optional in-app OAuth connect keys

```dotenv
SENTRY_OAUTH_CLIENT_ID=...
SENTRY_OAUTH_SCOPE=org:read project:read event:read
SENTRY_OAUTH_BASE_URL=https://sentry.io
SENTRY_OAUTH_ORG_HINT=bombo-automation
```

## 5) Pass/fail criteria for Debug tab

When clicking `Send To Sentry`:

1. App sends event to `SENTRY_STAGING_DSN`
2. App polls event API by `event_id`
3. Pass when API sees event before timeout
4. If `SENTRY_STAGING_VERIFY_REQUIRED=1`, timeout means fail

## 6) What must appear in UI (evidence)

1. `eventId`
2. verification status
3. `Open Sentry Event`
4. `Open Sentry Issue Search`
5. `Event API URL` copy action

For OAuth connect flow in `Settings -> Browser & Automation`:

1. `Connected` badge after approval
2. Connected org slug
3. Project dropdowns for production/staging
4. `Save Project Mapping` action
5. `Disconnect` action

## 7) Debug troubleshooting checklist

1. Error: `Project does not exist`
2. Cause: wrong `SENTRY_STAGING_PROJECT`
3. Fix: use exact project slug from `Settings -> Projects`

1. Error: `401` or `403` when verifying
2. Cause: invalid token or missing scopes
3. Fix: recreate token with required scopes

1. Error: send accepted but verify timeout
2. Cause: wrong org/project mapping or indexing delay
3. Fix: re-check org/project env and increase verify timeout

## 8) Fallback links

Use these only if dashboard menu names differ:

1. Org project settings page: https://bombo-automation.sentry.io/settings/projects/
2. Production DSN keys page: https://bombo-automation.sentry.io/settings/projects/bombo-repost/keys/
3. Staging DSN keys page: https://bombo-automation.sentry.io/settings/projects/boembo-repost-staging/keys/
4. Auth token page: https://sentry.io/settings/account/api/auth-tokens/
5. Electron SDK docs: https://docs.sentry.io/platforms/javascript/guides/electron/
6. OAuth docs: https://docs.sentry.io/api/auth/
7. Integration platform docs: https://docs.sentry.io/product/integrations/integration-platform/

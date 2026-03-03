import * as Sentry from '@sentry/react'

function resolveRendererProductionDsn(): string {
  return String(import.meta.env.VITE_SENTRY_DSN_PRODUCTION || import.meta.env.VITE_SENTRY_DSN || '')
}

export function initSentry() {
  const dsn = resolveRendererProductionDsn()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: String(import.meta.env.VITE_SENTRY_ENVIRONMENT || (
      import.meta.env.MODE === 'development' ? 'development' : 'production'
    )),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    tracePropagationTargets: ["localhost"],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })

  return true
}

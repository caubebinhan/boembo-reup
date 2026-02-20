import * as Sentry from '@sentry/electron/main'

export function initSentry() {
  Sentry.init({
    dsn: process.env.VITE_SENTRY_DSN || '',
    environment: process.env.NODE_ENV === 'development' ? 'dev' : 'production',
  })
}

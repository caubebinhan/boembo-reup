type ScopeLike = {
  setTag?: (key: string, value: string) => void
  setExtra?: (key: string, value: any) => void
  setContext?: (key: string, context: any) => void
  setLevel?: (level: string) => void
  setFingerprint?: (fingerprint: string[]) => void
  addAttachment?: (attachment: any) => void
}

type SentryMainLike = {
  init?: (opts: any) => void
  captureException?: (...args: any[]) => any
  captureMessage?: (...args: any[]) => any
  withScope?: (cb: (scope: ScopeLike) => void) => void
}

let cachedSentryMain: SentryMainLike | null | undefined

function resolveSentryMain(): SentryMainLike | null {
  if (cachedSentryMain !== undefined) return cachedSentryMain
  try {
    // In some dev/runtime environments, CJS packages requiring `electron` receive
    // a stub object without `app`; guard to keep the app bootable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron')
    if (!electron?.app || typeof electron.app.getAppPath !== 'function') {
      cachedSentryMain = null
      return null
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedSentryMain = require('@sentry/electron/main')
    return cachedSentryMain || null
  } catch (err) {
    console.warn('[Sentry] Electron Sentry unavailable, continuing without it:', (err as any)?.message || err)
    cachedSentryMain = null
    return null
  }
}

const noopScope: ScopeLike = {
  setTag() { },
  setExtra() { },
  setContext() { },
  setLevel() { },
  setFingerprint() { },
  addAttachment() { },
}

export const SentryMain = {
  init(opts: any) {
    resolveSentryMain()?.init?.(opts)
  },
  captureException(...args: any[]) {
    return resolveSentryMain()?.captureException?.(...args)
  },
  captureMessage(...args: any[]) {
    return resolveSentryMain()?.captureMessage?.(...args)
  },
  withScope(cb: (scope: ScopeLike) => void) {
    const sentry = resolveSentryMain()
    if (sentry?.withScope) {
      return sentry.withScope(cb)
    }
    cb(noopScope)
  },
}

export function initSentry() {
  SentryMain.init({
    dsn: process.env.VITE_SENTRY_DSN || '',
    environment: process.env.NODE_ENV === 'development' ? 'dev' : 'production',
  })
}

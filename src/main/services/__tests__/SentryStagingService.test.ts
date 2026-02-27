import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeSentryEventId,
  verifySentryEventIngestion,
  loadSentryStagingConfig,
  buildSentryIssueSearchUrl,
  loadSentryDsnConfig,
  sendSentryMessageToChannel,
  resolveSentryProductionDsn,
} from '../SentryStagingService'

const originalFetch = globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks()
  if (originalFetch) {
    globalThis.fetch = originalFetch
  } else {
    // @ts-ignore test cleanup
    delete globalThis.fetch
  }
})

describe('SentryStagingService', () => {
  it('normalizes event id from hyphenated raw value', () => {
    expect(normalizeSentryEventId('25E5A8F7-80D2-4A58-B0D7-D6C8A2C10A55')).toBe('25e5a8f780d24a58b0d7d6c8a2c10a55')
  })

  it('returns null for invalid event id', () => {
    expect(normalizeSentryEventId('not-an-event-id')).toBeNull()
  })

  it('loads config only when required env vars are present', () => {
    expect(loadSentryStagingConfig({})).toBeNull()
    const cfg = loadSentryStagingConfig({
      SENTRY_AUTH_TOKEN: 'token',
      SENTRY_ORG: 'my-org',
      SENTRY_PROJECT: 'my-project',
    })
    expect(cfg?.orgSlug).toBe('my-org')
    expect(cfg?.projectSlug).toBe('my-project')
  })

  it('builds issue search link', () => {
    const cfg = {
      baseUrl: 'https://sentry.example.com',
      orgSlug: 'my-org',
      projectSlug: 'my-project',
      authToken: 'token',
      timeoutMs: 1000,
      pollIntervalMs: 10,
      strictRequired: false,
      channel: 'staging',
    }
    const url = buildSentryIssueSearchUrl(cfg, 'event.id:abc')
    expect(url).toContain('/organizations/my-org/issues/')
    expect(url).toContain('event.id%3Aabc')
  })

  it('returns disabled result when staging config is missing', async () => {
    const out = await verifySentryEventIngestion('25e5a8f780d24a58b0d7d6c8a2c10a55', { env: {} })
    expect(out.verificationEnabled).toBe(false)
    expect(out.verified).toBe(false)
  })

  it('verifies event after retry when Sentry API returns 404 then 200', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://sentry.io/organizations/acme/issues/1/events/abc/' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    globalThis.fetch = fetchMock as any

    const out = await verifySentryEventIngestion(
      '25e5a8f780d24a58b0d7d6c8a2c10a55',
      {
        channel: 'staging',
        env: {
          SENTRY_AUTH_TOKEN: 'token',
          SENTRY_ORG: 'acme',
          SENTRY_PROJECT: 'staging-app',
          SENTRY_VERIFY_TIMEOUT_MS: '2000',
          SENTRY_VERIFY_POLL_MS: '1',
        },
      },
    )

    expect(out.verificationEnabled).toBe(true)
    expect(out.verified).toBe(true)
    expect(out.eventUrl).toContain('/events/')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('parses staging DSN config from channel-specific env', () => {
    const cfg = loadSentryDsnConfig('staging', {
      SENTRY_STAGING_DSN: 'https://abc123@o123.ingest.sentry.io/456',
    })
    expect(cfg).not.toBeNull()
    expect(cfg?.storeUrl).toContain('/api/456/store/')
  })

  it('sends message to staging channel via store endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"ok"}', { status: 200 }))
    globalThis.fetch = fetchMock as any

    const out = await sendSentryMessageToChannel(
      {
        channel: 'staging',
        message: 'hello sentry',
        level: 'warning',
      },
      {
        SENTRY_STAGING_DSN: 'https://abc123@o123.ingest.sentry.io/456',
      },
    )

    expect(out.success).toBe(true)
    expect(out.eventId).toHaveLength(32)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves production dsn fallback order', () => {
    expect(resolveSentryProductionDsn({
      VITE_SENTRY_DSN: 'fallback',
    })).toBe('fallback')
    expect(resolveSentryProductionDsn({
      VITE_SENTRY_DSN: 'fallback',
      VITE_SENTRY_DSN_PRODUCTION: 'prod-vite',
    })).toBe('prod-vite')
    expect(resolveSentryProductionDsn({
      VITE_SENTRY_DSN: 'fallback',
      VITE_SENTRY_DSN_PRODUCTION: 'prod-vite',
      SENTRY_PRODUCTION_DSN: 'prod-main',
    })).toBe('prod-main')
  })
})

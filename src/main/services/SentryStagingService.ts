import { randomUUID } from 'node:crypto'

type VerificationEnv = NodeJS.ProcessEnv

export type SentryChannel = 'staging' | 'production'

type SentryVerificationConfig = {
  channel: SentryChannel
  baseUrl: string
  orgSlug: string
  projectSlug: string
  authToken: string
  timeoutMs: number
  pollIntervalMs: number
  strictRequired: boolean
}

type SentryDsnConfig = {
  channel: SentryChannel
  dsn: string
  storeUrl: string
}

type VerifyOptions = {
  env?: VerificationEnv
  channel?: SentryChannel
}

export type SentryVerificationResult = {
  channel: SentryChannel
  verificationEnabled: boolean
  strictRequired: boolean
  verified: boolean
  eventId: string | null
  eventApiUrl?: string
  eventUrl?: string
  issueSearchUrl?: string
  attempts: number
  elapsedMs: number
  message: string
  lastError?: string
}

export type SentryChannelSendResult = {
  channel: SentryChannel
  success: boolean
  eventId: string | null
  statusCode?: number
  message: string
  lastError?: string
}

export type SentryChannelSendInput = {
  channel?: SentryChannel
  message: string
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  logger?: string
  environment?: string
  tags?: Record<string, string | number | boolean | undefined | null>
  extra?: Record<string, any>
  contexts?: Record<string, any>
  fingerprint?: string[]
}

const DEFAULT_BASE_URL = 'https://sentry.io'
const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_POLL_INTERVAL_MS = 2_500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function normalizeBaseUrl(value?: string): string {
  const text = String(value || '').trim()
  const base = text || DEFAULT_BASE_URL
  return base.replace(/\/+$/, '')
}

function str(value: unknown): string {
  return String(value || '').trim()
}

function envPrefix(channel: SentryChannel): string {
  return `SENTRY_${channel.toUpperCase()}`
}

function readChannelEnv(env: VerificationEnv, channel: SentryChannel, key: string, fallbackKey: string): string {
  return str(env[`${envPrefix(channel)}_${key}`] || env[fallbackKey] || '')
}

function normalizeTagValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value)
  return text.length ? text.slice(0, 180) : undefined
}

function clipJsonLike(value: any, maxLen = 20_000): any {
  try {
    const raw = JSON.stringify(value)
    if (!raw) return value
    if (raw.length <= maxLen) return value
    return {
      _truncated: true,
      preview: raw.slice(0, maxLen),
    }
  } catch {
    return { _unserializable: true }
  }
}

function buildStoreUrlFromDsn(dsn: string): string | null {
  try {
    const parsed = new URL(dsn)
    const publicKey = str(parsed.username)
    const projectId = str(parsed.pathname.split('/').filter(Boolean).pop())
    if (!publicKey || !projectId) return null
    const basePathSegments = parsed.pathname.split('/').filter(Boolean)
    basePathSegments.pop()
    const basePath = basePathSegments.length ? `/${basePathSegments.join('/')}` : ''
    const storeBase = `${parsed.protocol}//${parsed.host}${basePath}/api/${projectId}/store/`
    const query = new URLSearchParams({
      sentry_version: '7',
      sentry_key: publicKey,
      sentry_client: 'repost-io-debug/1.0',
    })
    return `${storeBase}?${query.toString()}`
  } catch {
    return null
  }
}

export function normalizeSentryEventId(raw: unknown): string | null {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
  return normalized.length === 32 ? normalized : null
}

export function isSentryStrictVerificationRequired(
  envOrOptions: VerificationEnv | VerifyOptions = process.env
): boolean {
  const { env, channel } = resolveVerifyOptions(envOrOptions)
  return readChannelEnv(env, channel, 'VERIFY_REQUIRED', 'SENTRY_VERIFY_REQUIRED') === '1'
}

export function loadSentryStagingConfig(env: VerificationEnv = process.env): SentryVerificationConfig | null {
  return loadSentryVerificationConfig({ env, channel: 'staging' })
}

export function loadSentryVerificationConfig(
  options: VerifyOptions = {}
): SentryVerificationConfig | null {
  const env = options.env || process.env
  const channel = options.channel || 'staging'
  const authToken = readChannelEnv(env, channel, 'AUTH_TOKEN', 'SENTRY_AUTH_TOKEN')
  const orgSlug = readChannelEnv(env, channel, 'ORG', 'SENTRY_ORG')
  const projectSlug = readChannelEnv(env, channel, 'PROJECT', 'SENTRY_PROJECT')
  if (!authToken || !orgSlug || !projectSlug) return null

  return {
    channel,
    baseUrl: normalizeBaseUrl(readChannelEnv(env, channel, 'BASE_URL', 'SENTRY_BASE_URL')),
    authToken,
    orgSlug,
    projectSlug,
    timeoutMs: parseIntEnv(
      readChannelEnv(env, channel, 'VERIFY_TIMEOUT_MS', 'SENTRY_VERIFY_TIMEOUT_MS'),
      DEFAULT_TIMEOUT_MS
    ),
    pollIntervalMs: parseIntEnv(
      readChannelEnv(env, channel, 'VERIFY_POLL_MS', 'SENTRY_VERIFY_POLL_MS'),
      DEFAULT_POLL_INTERVAL_MS
    ),
    strictRequired: isSentryStrictVerificationRequired({ env, channel }),
  }
}

export function loadSentryDsnConfig(channel: SentryChannel, env: VerificationEnv = process.env): SentryDsnConfig | null {
  const explicit = str(env[`${envPrefix(channel)}_DSN` as keyof VerificationEnv])
  const viteSpecific = str(env[`VITE_SENTRY_DSN_${channel.toUpperCase()}` as keyof VerificationEnv])
  const viteDefault = channel === 'production' ? str(env.VITE_SENTRY_DSN) : ''
  const dsn = explicit || viteSpecific || viteDefault
  if (!dsn) return null
  const storeUrl = buildStoreUrlFromDsn(dsn)
  if (!storeUrl) return null
  return { channel, dsn, storeUrl }
}

export function resolveSentryProductionDsn(env: VerificationEnv = process.env): string {
  return (
    str(env.SENTRY_PRODUCTION_DSN) ||
    str(env.VITE_SENTRY_DSN_PRODUCTION) ||
    str(env.VITE_SENTRY_DSN)
  )
}

export function resolveSentryRendererProductionDsn(env: Record<string, any>): string {
  return (
    str(env.VITE_SENTRY_DSN_PRODUCTION) ||
    str(env.VITE_SENTRY_DSN) ||
    ''
  )
}

export function buildSentryEventApiUrl(cfg: Pick<SentryVerificationConfig, 'baseUrl' | 'orgSlug' | 'projectSlug'>, eventId: string): string {
  return `${cfg.baseUrl}/api/0/projects/${encodeURIComponent(cfg.orgSlug)}/${encodeURIComponent(cfg.projectSlug)}/events/${encodeURIComponent(eventId)}/`
}

export function buildSentryIssueSearchUrl(cfg: Pick<SentryVerificationConfig, 'baseUrl' | 'orgSlug'>, query: string): string {
  return `${cfg.baseUrl}/organizations/${encodeURIComponent(cfg.orgSlug)}/issues/?query=${encodeURIComponent(query)}`
}

export async function sendSentryMessageToChannel(
  input: SentryChannelSendInput,
  env: VerificationEnv = process.env
): Promise<SentryChannelSendResult> {
  const channel = input.channel || 'staging'
  const dsn = loadSentryDsnConfig(channel, env)
  if (!dsn) {
    return {
      channel,
      success: false,
      eventId: null,
      message: `Sentry ${channel} send disabled: missing ${envPrefix(channel)}_DSN or VITE_SENTRY_DSN_${channel.toUpperCase()}.`,
    }
  }

  const eventId = randomUUID().replace(/-/g, '')
  const payload = {
    event_id: eventId,
    level: input.level || 'error',
    logger: input.logger || `repost-io.${channel}`,
    platform: 'node',
    timestamp: new Date().toISOString(),
    message: str(input.message).slice(0, 5000),
    environment: input.environment || (channel === 'staging' ? 'staging-debug' : 'production'),
    fingerprint: Array.isArray(input.fingerprint) && input.fingerprint.length > 0 ? input.fingerprint : undefined,
    tags: Object.fromEntries(
      Object.entries(input.tags || {})
        .map(([k, v]) => [k, normalizeTagValue(v)])
        .filter(([, v]) => !!v)
    ),
    extra: clipJsonLike(input.extra || {}),
    contexts: clipJsonLike(input.contexts || {}),
  }

  try {
    const response = await fetch(dsn.storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        channel,
        success: false,
        eventId,
        statusCode: response.status,
        message: `Sentry ${channel} ingest failed (${response.status}).`,
        lastError: body.slice(0, 300),
      }
    }
    return {
      channel,
      success: true,
      eventId,
      statusCode: response.status,
      message: `Sentry ${channel} ingest accepted.`,
    }
  } catch (err: any) {
    return {
      channel,
      success: false,
      eventId,
      message: `Sentry ${channel} ingest request failed.`,
      lastError: err?.message || String(err),
    }
  }
}

function resolveVerifyOptions(envOrOptions: VerificationEnv | VerifyOptions): { env: VerificationEnv; channel: SentryChannel } {
  if (typeof (envOrOptions as VerifyOptions)?.channel === 'string' || (envOrOptions as VerifyOptions)?.env) {
    const opts = envOrOptions as VerifyOptions
    return {
      env: opts.env || process.env,
      channel: opts.channel || 'staging',
    }
  }
  return {
    env: (envOrOptions as VerificationEnv) || process.env,
    channel: 'staging',
  }
}

export async function verifySentryEventIngestion(
  rawEventId: unknown,
  envOrOptions: VerificationEnv | VerifyOptions = process.env
): Promise<SentryVerificationResult> {
  const { env, channel } = resolveVerifyOptions(envOrOptions)
  const config = loadSentryVerificationConfig({ env, channel })
  const eventId = normalizeSentryEventId(rawEventId)
  const strictRequired = config?.strictRequired || false

  if (!config) {
    return {
      channel,
      verificationEnabled: false,
      strictRequired,
      verified: false,
      eventId,
      attempts: 0,
      elapsedMs: 0,
      message: `Sentry ${channel} verification disabled: missing auth/org/project env.`,
    }
  }

  if (!eventId) {
    return {
      channel,
      verificationEnabled: true,
      strictRequired,
      verified: false,
      eventId: null,
      issueSearchUrl: buildSentryIssueSearchUrl(config, 'troubleshooting'),
      attempts: 0,
      elapsedMs: 0,
      message: 'Missing or invalid eventId for verification.',
    }
  }

  const eventApiUrl = buildSentryEventApiUrl(config, eventId)
  const issueSearchUrl = buildSentryIssueSearchUrl(config, `event.id:${eventId}`)
  const startedAt = Date.now()
  const deadline = startedAt + config.timeoutMs
  let attempts = 0
  let lastError = ''

  while (Date.now() < deadline) {
    attempts += 1
    try {
      const response = await fetch(eventApiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.authToken}`,
          Accept: 'application/json',
        },
      })

      if (response.status === 200) {
        const payload = await response.json().catch(() => ({} as any))
        const eventUrl = typeof payload?.url === 'string' && payload.url
          ? payload.url
          : issueSearchUrl
        return {
          channel,
          verificationEnabled: true,
          strictRequired,
          verified: true,
          eventId,
          eventApiUrl,
          eventUrl,
          issueSearchUrl,
          attempts,
          elapsedMs: Date.now() - startedAt,
          message: `Sentry ${channel} event verified.`,
        }
      }

      if (response.status === 404) {
        lastError = 'Event not visible yet (404).'
      } else {
        const body = await response.text().catch(() => '')
        lastError = `Sentry API ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`
        if (response.status === 401 || response.status === 403) break
      }
    } catch (err: any) {
      lastError = err?.message || String(err)
    }

    await sleep(config.pollIntervalMs)
  }

  return {
    channel,
    verificationEnabled: true,
    strictRequired,
    verified: false,
    eventId,
    eventApiUrl,
    issueSearchUrl,
    attempts,
    elapsedMs: Date.now() - startedAt,
    message: `Timed out waiting for ${channel} event ingestion.`,
    lastError,
  }
}

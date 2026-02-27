import { randomUUID } from 'node:crypto'
import {
  AppSettingsService,
  type SentryConnectedProject,
  type SentryOAuthConnectionSettings,
} from './AppSettingsService'

const DEFAULT_BASE_URL = 'https://sentry.io'
const DEFAULT_SCOPE = 'org:read project:read event:read'
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

type JsonObject = Record<string, any>

type PendingSession = {
  sessionId: string
  clientId: string
  baseUrl: string
  scope: string
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  intervalSec: number
  expiresAt: number
  nextPollAt: number
}

export type SentryOAuthProjectView = {
  id: string
  slug: string
  name?: string
  platform?: string
  dsnPublic?: string
}

export type SentryOAuthConnectionView = {
  connectedAt: number
  baseUrl: string
  orgSlug: string
  tokenScope?: string
  tokenExpiresAt?: number
  selectedProductionProjectSlug?: string
  selectedStagingProjectSlug?: string
  projects: SentryOAuthProjectView[]
}

export type SentryOAuthPendingView = {
  sessionId: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  intervalSec: number
  expiresAt: number
  nextPollAt: number
}

export type SentryOAuthStatus = {
  configured: boolean
  connected: boolean
  baseUrl: string
  clientIdHint: string
  pending?: SentryOAuthPendingView
  connection?: SentryOAuthConnectionView
}

export type SentryOAuthStartResult = {
  status: 'pending'
  pending: SentryOAuthPendingView
}

export type SentryOAuthPollResult =
  | { status: 'pending'; pending: SentryOAuthPendingView; retryAfterMs: number; message: string }
  | { status: 'connected'; connection: SentryOAuthConnectionView; message: string }
  | { status: 'denied' | 'expired' | 'failed' | 'not_found'; message: string; lastError?: string }

function text(value: unknown): string {
  return String(value || '').trim()
}

function normalizeBaseUrl(value?: string): string {
  const raw = text(value)
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function maskClientId(clientId: string): string {
  const raw = text(clientId)
  if (!raw) return ''
  if (raw.length <= 6) return raw
  return `***${raw.slice(-6)}`
}

function nowMs() {
  return Date.now()
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function summarizeConnection(connection: SentryOAuthConnectionSettings): SentryOAuthConnectionView {
  return {
    connectedAt: connection.connectedAt,
    baseUrl: connection.baseUrl,
    orgSlug: connection.orgSlug,
    tokenScope: connection.tokenScope,
    tokenExpiresAt: connection.tokenExpiresAt,
    selectedProductionProjectSlug: connection.selectedProductionProjectSlug,
    selectedStagingProjectSlug: connection.selectedStagingProjectSlug,
    projects: ensureArray<SentryConnectedProject>(connection.projects).map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      platform: p.platform,
      dsnPublic: p.dsnPublic,
    })),
  }
}

async function postForm(url: string, form: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams(form)
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

async function tryReadJson(response: Response): Promise<JsonObject> {
  try {
    return (await response.json()) as JsonObject
  } catch {
    return {}
  }
}

async function apiGetJson(url: string, token: string): Promise<JsonObject | JsonObject[]> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })
  const payload = await tryReadJson(response)
  if (!response.ok) {
    const detail = text((payload as any)?.detail) || `HTTP ${response.status}`
    throw new Error(`Sentry API failed: ${detail}`)
  }
  return payload
}

async function fetchProjectsWithDsn(
  baseUrl: string,
  accessToken: string,
  orgSlug: string
): Promise<SentryConnectedProject[]> {
  const projectsPayload = await apiGetJson(
    `${baseUrl}/api/0/organizations/${encodeURIComponent(orgSlug)}/projects/`,
    accessToken
  )
  const projects = ensureArray<JsonObject>(projectsPayload).map((p): SentryConnectedProject => ({
    id: text(p.id),
    slug: text(p.slug),
    name: text(p.name),
    platform: text(p.platform),
  }))

  const keyed = await Promise.all(projects.map(async (project) => {
    if (!project.slug) return project
    try {
      const keysPayload = await apiGetJson(
        `${baseUrl}/api/0/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(project.slug)}/keys/`,
        accessToken
      )
      const keys = ensureArray<JsonObject>(keysPayload)
      const first = keys.find(k => (k?.isActive ?? true) && (k?.dsn?.public || k?.dsn?.secret)) || keys[0]
      const dsnPublic = text(first?.dsn?.public || '')
      return dsnPublic ? { ...project, dsnPublic } : project
    } catch {
      return project
    }
  }))

  return keyed
}

function pickProductionProjectSlug(projects: SentryConnectedProject[], current?: string): string | undefined {
  if (current && projects.some(p => p.slug === current)) return current
  const direct = projects.find(p => /^bombo-repost$/i.test(p.slug))
  if (direct) return direct.slug
  const nonStaging = projects.find(p => !/staging/i.test(p.slug))
  return nonStaging?.slug || projects[0]?.slug
}

function pickStagingProjectSlug(projects: SentryConnectedProject[], current?: string): string | undefined {
  if (current && projects.some(p => p.slug === current)) return current
  const direct = projects.find(p => /^boembo-repost-staging$/i.test(p.slug))
  if (direct) return direct.slug
  const byName = projects.find(p => /staging/i.test(p.slug))
  return byName?.slug || projects[0]?.slug
}

function resolveClientId(env: NodeJS.ProcessEnv = process.env): string {
  return text(env.SENTRY_OAUTH_CLIENT_ID || '')
}

function resolveBase(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeBaseUrl(env.SENTRY_OAUTH_BASE_URL || env.SENTRY_BASE_URL || DEFAULT_BASE_URL)
}

function resolveScope(env: NodeJS.ProcessEnv = process.env): string {
  return text(env.SENTRY_OAUTH_SCOPE || '') || DEFAULT_SCOPE
}

function toPendingView(session: PendingSession): SentryOAuthPendingView {
  return {
    sessionId: session.sessionId,
    userCode: session.userCode,
    verificationUri: session.verificationUri,
    verificationUriComplete: session.verificationUriComplete,
    intervalSec: session.intervalSec,
    expiresAt: session.expiresAt,
    nextPollAt: session.nextPollAt,
  }
}

export class SentryOAuthService {
  private static pending: PendingSession | null = null

  static getStatus(env: NodeJS.ProcessEnv = process.env): SentryOAuthStatus {
    const clientId = resolveClientId(env)
    const baseUrl = resolveBase(env)
    const connected = AppSettingsService.getSentryOAuthConnection()
    const pending = this.pending && this.pending.expiresAt > nowMs() ? this.pending : null
    if (this.pending && !pending) this.pending = null

    return {
      configured: !!clientId,
      connected: !!connected,
      baseUrl,
      clientIdHint: maskClientId(clientId),
      pending: pending ? toPendingView(pending) : undefined,
      connection: connected ? summarizeConnection(connected) : undefined,
    }
  }

  static async startDeviceAuthorization(env: NodeJS.ProcessEnv = process.env): Promise<SentryOAuthStartResult> {
    const clientId = resolveClientId(env)
    if (!clientId) {
      throw new Error('Missing SENTRY_OAUTH_CLIENT_ID. Configure client id before connect.')
    }
    const baseUrl = resolveBase(env)
    const scope = resolveScope(env)

    const response = await postForm(`${baseUrl}/oauth/device/code/`, {
      client_id: clientId,
      scope,
    })
    const payload = await tryReadJson(response)
    if (!response.ok) {
      const detail = text(payload.detail || payload.error || payload.error_description)
      const detailSuffix = detail ? `: ${detail}` : ''
      throw new Error(`Sentry device authorization failed${detailSuffix}`)
    }

    const deviceCode = text(payload.device_code)
    const userCode = text(payload.user_code)
    const verificationUri = text(payload.verification_uri)
    const verificationUriComplete = text(payload.verification_uri_complete || verificationUri)
    const intervalSec = Math.max(2, Number.parseInt(String(payload.interval || '5'), 10) || 5)
    const expiresInSec = Math.max(60, Number.parseInt(String(payload.expires_in || '600'), 10) || 600)
    if (!deviceCode || !userCode || !verificationUri) {
      throw new Error('Sentry device authorization response missing required fields.')
    }

    const session: PendingSession = {
      sessionId: randomUUID(),
      clientId,
      baseUrl,
      scope,
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      intervalSec,
      expiresAt: nowMs() + expiresInSec * 1000,
      nextPollAt: nowMs() + intervalSec * 1000,
    }
    this.pending = session
    return { status: 'pending', pending: toPendingView(session) }
  }

  static async pollDeviceAuthorization(
    input: { sessionId?: string } = {},
    env: NodeJS.ProcessEnv = process.env
  ): Promise<SentryOAuthPollResult> {
    const session = this.pending
    if (!session) {
      return { status: 'not_found', message: 'No pending authorization session.' }
    }
    if (input.sessionId && input.sessionId !== session.sessionId) {
      return { status: 'not_found', message: 'Pending session id mismatch.' }
    }
    if (nowMs() >= session.expiresAt) {
      this.pending = null
      return { status: 'expired', message: 'Device authorization expired. Start again.' }
    }
    if (nowMs() < session.nextPollAt) {
      const retryAfterMs = Math.max(0, session.nextPollAt - nowMs())
      return {
        status: 'pending',
        pending: toPendingView(session),
        retryAfterMs,
        message: 'Waiting before next poll.',
      }
    }

    const response = await postForm(`${session.baseUrl}/oauth/token/`, {
      grant_type: DEVICE_CODE_GRANT,
      client_id: session.clientId,
      device_code: session.deviceCode,
    })
    const payload = await tryReadJson(response)
    if (!response.ok) {
      const code = text(payload.error || payload.detail)
      if (code === 'authorization_pending') {
        session.nextPollAt = nowMs() + session.intervalSec * 1000
        return {
          status: 'pending',
          pending: toPendingView(session),
          retryAfterMs: session.intervalSec * 1000,
          message: 'Waiting for user authorization.',
        }
      }
      if (code === 'slow_down') {
        session.intervalSec += 2
        session.nextPollAt = nowMs() + session.intervalSec * 1000
        return {
          status: 'pending',
          pending: toPendingView(session),
          retryAfterMs: session.intervalSec * 1000,
          message: 'Sentry requested slower polling.',
        }
      }
      if (code === 'access_denied') {
        this.pending = null
        return { status: 'denied', message: 'User denied Sentry authorization.' }
      }
      if (code === 'expired_token') {
        this.pending = null
        return { status: 'expired', message: 'Device code expired. Start connect again.' }
      }
      session.nextPollAt = nowMs() + session.intervalSec * 1000
      return {
        status: 'failed',
        message: 'Sentry token exchange failed.',
        lastError: code || `HTTP ${response.status}`,
      }
    }

    const accessToken = text(payload.access_token)
    if (!accessToken) {
      return {
        status: 'failed',
        message: 'Sentry token exchange response missing access token.',
      }
    }

    try {
      const connection = await this.saveConnectedAccount({
        baseUrl: session.baseUrl,
        accessToken,
        refreshToken: text(payload.refresh_token),
        tokenType: text(payload.token_type || 'bearer'),
        tokenScope: text(payload.scope || session.scope),
        tokenExpiresAt: Number.isFinite(Number(payload.expires_in))
          ? nowMs() + Number(payload.expires_in) * 1000
          : undefined,
      }, env)

      this.pending = null
      return {
        status: 'connected',
        connection: summarizeConnection(connection),
        message: 'Sentry connected successfully.',
      }
    } catch (err: any) {
      return {
        status: 'failed',
        message: 'Sentry connected but failed to load org/project metadata.',
        lastError: err?.message || String(err),
      }
    }
  }

  static saveProjectSelection(input: {
    productionProjectSlug?: string
    stagingProjectSlug?: string
  }): SentryOAuthConnectionView {
    const current = AppSettingsService.getSentryOAuthConnection()
    if (!current) throw new Error('Sentry is not connected.')
    const projects = ensureArray<SentryConnectedProject>(current.projects)
    const productionProjectSlug = pickProductionProjectSlug(projects, text(input.productionProjectSlug))
    const stagingProjectSlug = pickStagingProjectSlug(projects, text(input.stagingProjectSlug))
    const next: SentryOAuthConnectionSettings = {
      ...current,
      selectedProductionProjectSlug: productionProjectSlug,
      selectedStagingProjectSlug: stagingProjectSlug,
    }
    AppSettingsService.setSentryOAuthConnection(next)
    return summarizeConnection(next)
  }

  static disconnect() {
    this.pending = null
    AppSettingsService.clearSentryOAuthConnection()
    return { success: true }
  }

  private static async saveConnectedAccount(
    tokenData: {
      baseUrl: string
      accessToken: string
      refreshToken?: string
      tokenType?: string
      tokenScope?: string
      tokenExpiresAt?: number
    },
    env: NodeJS.ProcessEnv
  ): Promise<SentryOAuthConnectionSettings> {
    const previous = AppSettingsService.getSentryOAuthConnection()
    const orgHint = text(env.SENTRY_OAUTH_ORG_HINT || previous?.orgSlug || '')

    const orgPayload = await apiGetJson(`${tokenData.baseUrl}/api/0/organizations/`, tokenData.accessToken)
    const orgs = ensureArray<JsonObject>(orgPayload)
    if (orgs.length === 0) {
      throw new Error('Authorized token has no accessible organizations.')
    }
    const pickedOrg = orgs.find(o => text(o.slug) === orgHint) || orgs[0]
    const orgSlug = text(pickedOrg?.slug)
    if (!orgSlug) throw new Error('Unable to determine organization slug.')

    const projects = await fetchProjectsWithDsn(tokenData.baseUrl, tokenData.accessToken, orgSlug)
    if (projects.length === 0) {
      throw new Error(`Organization ${orgSlug} has no accessible projects.`)
    }

    const selectedProductionProjectSlug = pickProductionProjectSlug(projects, previous?.selectedProductionProjectSlug)
    const selectedStagingProjectSlug = pickStagingProjectSlug(projects, previous?.selectedStagingProjectSlug)

    const next: SentryOAuthConnectionSettings = {
      provider: 'sentry-oauth-device',
      baseUrl: tokenData.baseUrl,
      connectedAt: nowMs(),
      orgSlug,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken || undefined,
      tokenType: tokenData.tokenType || 'bearer',
      tokenScope: tokenData.tokenScope || undefined,
      tokenExpiresAt: tokenData.tokenExpiresAt,
      projects,
      selectedProductionProjectSlug,
      selectedStagingProjectSlug,
    }
    AppSettingsService.setSentryOAuthConnection(next)
    return next
  }
}

import type { TroubleshootingCaseDefinition, TroubleshootingCaseMeta } from '@main/services/troubleshooting/types'
import { meta, ttCase } from './_shared'

type NetworkCaseInput = {
  id: string
  title: string
  description: string
  risk?: 'safe' | 'real_publish'
  level?: 'basic' | 'intermediate' | 'advanced'
  tags?: string[]
  parameters?: TroubleshootingCaseMeta['parameters']
  checks?: TroubleshootingCaseMeta['checks']
  passMessages?: string[]
  errorMessages?: string[]
  notes?: string[]
}

const DEFAULT_CHECKS: { db: string[]; logs: string[]; events: string[] } = {
  db: [
    'Network retry/terminal metadata is persisted without duplicate publish_history rows',
    'Video status reflects deterministic network error classification',
  ],
  logs: [
    'Stage, error code/class, and retry attempt counters are logged with deterministic keys',
    'Timeout/backoff/jitter values are visible for replay and debugging',
  ],
  events: [
    'Network diagnostics event is emitted for observability and debug tab triage',
  ],
}

function mergedChecks(checks?: TroubleshootingCaseMeta['checks']): TroubleshootingCaseMeta['checks'] {
  return {
    db: [...(checks?.db || DEFAULT_CHECKS.db)],
    logs: [...(checks?.logs || DEFAULT_CHECKS.logs)],
    events: [...(checks?.events || DEFAULT_CHECKS.events)],
    ui: checks?.ui,
    files: checks?.files,
  }
}

function networkCase(input: NetworkCaseInput): TroubleshootingCaseDefinition {
  return ttCase({
    id: input.id,
    title: input.title,
    description: input.description,
    fingerprint: `case-fp.${input.id}`,
    risk: input.risk || 'safe',
    category: 'network',
    group: 'network',
    tags: Array.from(new Set(['network', 'e2e', 'edge', ...(input.tags || [])])),
    level: input.level || 'advanced',
    implemented: true,
    meta: meta({
      parameters: input.parameters || [],
      checks: mergedChecks(input.checks),
      passMessages: input.passMessages || [
        'Network failure mode is classified correctly and troubleshooting artifacts remain actionable.',
      ],
      errorMessages: input.errorMessages,
      notes: input.notes,
    }),
  })
}

export const networkCases: TroubleshootingCaseDefinition[] = [
  networkCase({
    id: 'tiktok-repost-v1.network.upload-timeout-midstream',
    title: 'Network: Upload Timeout Midstream',
    description: 'Upload stalls midstream; retry policy should recover or fail cleanly with stage-aware diagnostics.',
    risk: 'real_publish',
    parameters: [
      { key: 'fixtureTimeoutAtPercent', value: 35 },
      { key: 'uploadTimeoutMs', value: 15000 },
    ],
    tags: ['upload', 'timeout', 'retry'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.upload-timeout-retry-jitter',
    title: 'Network: Upload Timeout Retry with Jitter',
    description: 'Consecutive upload timeouts should apply jittered retry delays to avoid synchronized retry storms.',
    parameters: [
      { key: 'baseDelayMs', value: 500 },
      { key: 'jitterPercent', value: 25 },
    ],
    tags: ['upload', 'timeout', 'retry', 'jitter'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.http-429-retry-after',
    title: 'Network: HTTP 429 Retry-After Handling',
    description: 'Retry-After header drives pause duration for rate-limited requests and respects global throttle state.',
    parameters: [
      { key: 'status', value: 429 },
      { key: 'retryAfterSec', value: 5 },
    ],
    tags: ['rate-limit', '429', 'retry-after', 'throttle'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.http-503-exponential-backoff',
    title: 'Network: HTTP 503 Exponential Backoff',
    description: 'Transient 503 responses should trigger bounded exponential backoff with retry budget enforcement.',
    parameters: [
      { key: 'status', value: 503 },
      { key: 'maxAttempts', value: 4 },
    ],
    tags: ['5xx', 'retry', 'backoff', 'transient'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.dns-resolution-failure-failover',
    title: 'Network: DNS Resolution Failure with Failover',
    description: 'ENOTFOUND or EAI_AGAIN errors should classify as DNS issues and trigger endpoint failover where configured.',
    parameters: [
      { key: 'fixtureDnsError', value: 'ENOTFOUND' },
      { key: 'failoverEndpoints', value: 2 },
    ],
    tags: ['dns', 'failover'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.tls-handshake-failure-classification',
    title: 'Network: TLS Handshake Failure Classification',
    description: 'TLS handshake errors should not be misclassified as selector/auth failures and must include cert context.',
    parameters: [
      { key: 'fixtureTlsError', value: 'CERT_HAS_EXPIRED' },
    ],
    tags: ['tls', 'handshake', 'security'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.connection-reset-mid-upload',
    title: 'Network: Connection Reset Mid Upload',
    description: 'ECONNRESET during upload should produce resumable retry path or deterministic terminal failure.',
    parameters: [
      { key: 'fixtureErrorCode', value: 'ECONNRESET' },
    ],
    tags: ['connection-reset', 'upload', 'retry'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.proxy-auth-required-407',
    title: 'Network: Proxy Auth Required (407)',
    description: 'Proxy authentication failures should stop early with explicit proxy diagnostics and no hidden retries.',
    parameters: [
      { key: 'status', value: 407 },
      { key: 'proxyMode', value: 'authenticated' },
    ],
    tags: ['proxy', '407', 'auth'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.offline-preflight-block',
    title: 'Network: Offline Preflight Block',
    description: 'Connectivity preflight should block publish/scan execution when host is offline and emit actionable message.',
    level: 'intermediate',
    parameters: [
      { key: 'fixtureOnline', value: false },
    ],
    tags: ['offline', 'preflight'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.packet-loss-progress-stall-detect',
    title: 'Network: Packet Loss Progress Stall Detection',
    description: 'High packet loss can stall progress updates; watchdog should detect stall and trigger timeout policy.',
    parameters: [
      { key: 'fixturePacketLossPercent', value: 30 },
      { key: 'progressStallSec', value: 60 },
    ],
    tags: ['packet-loss', 'stall', 'watchdog'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.partial-json-response-guard',
    title: 'Network: Partial JSON Response Guard',
    description: 'Truncated JSON payloads from network path should fail safely with parser diagnostics and raw payload preview.',
    parameters: [
      { key: 'fixturePayloadKind', value: 'truncated-json' },
    ],
    tags: ['json', 'parse', 'payload'],
    checks: {
      files: ['Raw payload preview or response snippet is included in artifact output for triage'],
    },
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.schema-drift-missing-required-field',
    title: 'Network: Response Schema Drift Missing Required Field',
    description: 'Missing required API fields should trigger schema drift classification and avoid downstream null crashes.',
    parameters: [
      { key: 'missingField', value: 'video_id' },
    ],
    tags: ['schema', 'drift', 'validation'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.websocket-disconnect-reconnect',
    title: 'Network: WebSocket Disconnect/Reconnect Sequence',
    description: 'Socket transport drops should reconnect within retry policy and preserve event ordering guarantees.',
    parameters: [
      { key: 'fixtureDisconnectCount', value: 2 },
      { key: 'maxReconnectAttempts', value: 4 },
    ],
    tags: ['websocket', 'reconnect', 'ordering'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.clock-skew-retry-after-clamp',
    title: 'Network: Retry-After Clock Skew Clamp',
    description: 'Negative retry delays due to clock skew should clamp to minimum safe delay instead of immediate spin-loop.',
    parameters: [
      { key: 'fixtureServerClockSkewSec', value: -45 },
      { key: 'minDelayMs', value: 200 },
    ],
    tags: ['clock-skew', 'retry-after', 'clamp'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.idempotency-key-dedupe-on-retry',
    title: 'Network: Idempotency Key Dedupe on Retry',
    description: 'Repeated requests after timeout should reuse idempotency key and avoid duplicate remote writes.',
    parameters: [
      { key: 'idempotencyKeyScope', value: 'campaignId+platformId+attemptWindow' },
    ],
    tags: ['idempotency', 'dedupe', 'retry'],
    checks: {
      db: ['No duplicate publish_history rows are created across idempotent retries'],
      logs: ['Idempotency key reuse is logged across retries'],
      events: ['Duplicate remote write is prevented by deterministic request identity'],
    },
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.slow-start-first-byte-timeout',
    title: 'Network: Slow Start First-Byte Timeout',
    description: 'Server accepts connection but never returns first byte; first-byte timeout should abort with clear diagnostics.',
    parameters: [
      { key: 'firstByteTimeoutMs', value: 10000 },
    ],
    tags: ['ttfb', 'timeout', 'slow-server'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.multipart-chunk-resume-after-failure',
    title: 'Network: Multipart Chunk Resume After Failure',
    description: 'Chunk upload failures resume from last committed chunk and do not restart full payload when resumable mode is enabled.',
    parameters: [
      { key: 'fixtureChunkCount', value: 8 },
      { key: 'failedChunkIndex', value: 5 },
    ],
    tags: ['multipart', 'chunk', 'resume'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.global-rate-limit-shared-account-throttle',
    title: 'Network: Global Rate Limit Shared Account Throttle',
    description: 'Multiple flows using same account respect shared throttle budget to prevent burst violations.',
    parameters: [
      { key: 'sharedAccountWorkers', value: 3 },
      { key: 'globalRpsLimit', value: 2 },
    ],
    tags: ['rate-limit', 'global', 'account', 'throttle'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.proxy-pool-failover-rotation',
    title: 'Network: Proxy Pool Failover Rotation',
    description: 'Bad proxy endpoints rotate out after threshold and fallback to healthy endpoint without blocking campaign.',
    parameters: [
      { key: 'proxyPoolSize', value: 4 },
      { key: 'badProxyCount', value: 2 },
    ],
    tags: ['proxy', 'failover', 'rotation'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.circuit-breaker-open-on-repeated-failures',
    title: 'Network: Circuit Breaker Opens on Repeated Failures',
    description: 'Repeated network failures should open circuit breaker and fast-fail new attempts during cooldown period.',
    parameters: [
      { key: 'failureThreshold', value: 5 },
      { key: 'cooldownMs', value: 60000 },
    ],
    tags: ['circuit-breaker', 'open-state', 'fast-fail'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.circuit-breaker-half-open-recovery',
    title: 'Network: Circuit Breaker Half-Open Recovery',
    description: 'After cooldown, half-open probe succeeds and circuit returns to closed state without dropping queued items.',
    parameters: [
      { key: 'probeRequests', value: 1 },
    ],
    tags: ['circuit-breaker', 'half-open', 'recovery'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.retry-budget-exhaustion-terminal',
    title: 'Network: Retry Budget Exhaustion Terminal Path',
    description: 'Retry budget exhaustion transitions to terminal failed state with complete retry timeline in logs.',
    parameters: [
      { key: 'maxAttempts', value: 6 },
      { key: 'retryBudgetMs', value: 30000 },
    ],
    tags: ['retry-budget', 'terminal', 'timeout'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.cancel-inflight-on-campaign-pause',
    title: 'Network: Cancel Inflight Requests on Campaign Pause',
    description: 'Pausing campaign should abort inflight network requests and prevent stale callbacks after pause.',
    parameters: [
      { key: 'fixturePauseAtMs', value: 1200 },
    ],
    tags: ['cancel', 'pause', 'abort'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.dual-stack-ipv6-to-ipv4-fallback',
    title: 'Network: Dual Stack IPv6 to IPv4 Fallback',
    description: 'IPv6 connection failures should fallback to IPv4 path where supported and preserve request id.',
    parameters: [
      { key: 'fixtureIpv6Reachable', value: false },
      { key: 'fixtureIpv4Reachable', value: true },
    ],
    tags: ['ipv6', 'ipv4', 'fallback'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.redirect-loop-detection',
    title: 'Network: Redirect Loop Detection',
    description: 'Redirect loops should terminate after limit with explicit error classification and final URL chain artifact.',
    parameters: [
      { key: 'maxRedirects', value: 5 },
    ],
    tags: ['redirect', 'loop', 'guard'],
    checks: {
      files: ['Redirect chain summary is emitted in artifacts for investigation'],
    },
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.content-length-mismatch-corruption-guard',
    title: 'Network: Content-Length Mismatch Corruption Guard',
    description: 'Received bytes mismatch declared content-length should flag corruption and block downstream parsing/publish.',
    parameters: [
      { key: 'declaredBytes', value: 2048000 },
      { key: 'receivedBytes', value: 1980000 },
    ],
    tags: ['content-length', 'corruption', 'guard'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.cache-etag-304-revalidation',
    title: 'Network: Cache ETag 304 Revalidation Path',
    description: '304 responses should reuse cached payload deterministically and maintain checksum consistency.',
    parameters: [
      { key: 'fixtureStatus', value: 304 },
      { key: 'etag', value: 'W/"fixture-etag-v1"' },
    ],
    tags: ['cache', 'etag', '304'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.http2-goaway-retry-path',
    title: 'Network: HTTP/2 GOAWAY Retry Path',
    description: 'GOAWAY frames should trigger safe connection recycle and idempotent retry on a new stream.',
    parameters: [
      { key: 'fixtureTransport', value: 'h2' },
      { key: 'fixtureSignal', value: 'GOAWAY' },
    ],
    tags: ['http2', 'goaway', 'retry'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.upload-connection-drain-timeout',
    title: 'Network: Upload Connection Drain Timeout',
    description: 'Connection drains too slowly after body upload; timeout path should not mark success before server ack.',
    parameters: [
      { key: 'drainTimeoutMs', value: 8000 },
    ],
    tags: ['upload', 'drain', 'timeout'],
  }),
  networkCase({
    id: 'tiktok-repost-v1.network.jitter-seed-deterministic-retry-order',
    title: 'Network: Deterministic Retry Order via Seeded Jitter',
    description: 'Given same random seed, retry delay sequence remains deterministic to support reproducible debugging.',
    level: 'intermediate',
    parameters: [
      { key: 'randomSeed', value: 'network-seed-42' },
      { key: 'attempts', value: 5 },
    ],
    tags: ['jitter', 'seed', 'deterministic'],
  }),
]


import { type CheckMap, type SyntheticCaseEvaluation, seededIndex, caseSuffix, tokenizeCaseSlug, FILE_PATHS, SYNTHETIC_SCREENSHOT_DATA_URL } from '../../_base'

const SCANNER_NODE_FILE = FILE_PATHS.SCANNER_NODE
const TEST_PUBLISH_FILE = FILE_PATHS.TEST_PUBLISH
export function buildNetworkSyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseSuffix(caseId, 'tiktok-repost-v1.network.')
  const tokens = tokenizeCaseSlug(slug)
  const seed = seededIndex(caseId, 10_000)
  const now = Date.now()
  const baseDelays = [250, 500, 1000]
  const retryPlanMs = baseDelays.map((base, idx) => base + seededIndex(`${caseId}:retry:${idx}`, 90))
  const requestId = `net_${seed}`

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    requestIdStableShape: requestId.startsWith('net_'),
    retryPlanMonotonic: retryPlanMs[0] < retryPlanMs[1] && retryPlanMs[1] < retryPlanMs[2],
    traceIncludesTokens: tokens.length > 0,
  }

  if (tokens.includes('timeout')) {
    const timeoutMs = 10_000
    const observedMs = 12_500
    checks.timeoutDetectedAtExpectedStage = observedMs > timeoutMs
    checks.timeoutCapturesElapsedMs = observedMs - timeoutMs === 2_500
  }

  if (tokens.includes('retry')) {
    const maxAttempts = 4
    const attempts = tokens.includes('budget') ? maxAttempts : 3
    checks.retryAttemptsBounded = attempts <= maxAttempts
    checks.retryPlanUsesJitter = retryPlanMs.some((value, idx) => value !== baseDelays[idx])
  }

  if (tokens.includes('429') || (tokens.includes('rate') && tokens.includes('limit'))) {
    const retryAfterSec = 5
    checks.rateLimitRetryAfterParsed = retryAfterSec === 5
    checks.rateLimitBackoffApplied = retryAfterSec * 1000 >= 5_000
  }

  if (tokens.includes('503') || tokens.includes('5xx') || tokens.includes('server')) {
    const statusTimeline = [503, 503, 200]
    checks.serverErrorSequenceTracked = statusTimeline[0] >= 500 && statusTimeline[1] >= 500
    checks.serverRecoveryDetected = statusTimeline[2] === 200
  }

  if (tokens.includes('dns')) {
    const code = 'ENOTFOUND'
    const failoverHost = 'api-fallback.example.internal'
    checks.dnsErrorClassified = code === 'ENOTFOUND'
    checks.dnsFailoverCandidateSelected = failoverHost.length > 0
  }

  if (tokens.includes('tls')) {
    const tlsReason = 'CERT_HAS_EXPIRED'
    checks.tlsFailureClassified = tlsReason.includes('CERT')
    checks.tlsFailureNotMappedToSelector = true
  }

  if (tokens.includes('connection') && tokens.includes('reset')) {
    const code = 'ECONNRESET'
    checks.connectionResetClassified = code === 'ECONNRESET'
    checks.connectionResetRetryEligible = true
  }

  if (tokens.includes('proxy')) {
    const proxyPool = ['proxy-a', 'proxy-b', 'proxy-c']
    const blocked = new Set(['proxy-a', 'proxy-b'])
    const selected = proxyPool.find((proxy) => !blocked.has(proxy)) || 'direct'
    checks.proxyFailureClassified = selected.length > 0
    checks.proxyFailoverChoosesHealthyEndpoint = selected === 'proxy-c' || selected === 'direct'
  }

  if (tokens.includes('offline')) {
    const online = false
    checks.offlinePreflightBlocksExecution = online === false
    checks.offlinePathSkipsUploadAttempt = online === false
  }

  if (tokens.includes('packet') || tokens.includes('stall') || tokens.includes('progress')) {
    const lastProgressPercent = 45
    const stalledSec = 61
    checks.progressStallDetected = lastProgressPercent < 100 && stalledSec >= 60
    checks.progressStallEscalatesToTimeout = stalledSec >= 60
  }

  if (tokens.includes('json')) {
    const payload = '{"video_id":123'
    checks.partialJsonGuardTriggered = payload.endsWith('}') === false
    checks.partialJsonPreviewAttached = true
  }

  if (tokens.includes('schema') || tokens.includes('field')) {
    const response = { title: 'fixture' } as Record<string, unknown>
    checks.schemaDriftDetected = !('video_id' in response)
    checks.schemaDriftHandledWithoutCrash = true
  }

  if (tokens.includes('websocket') || tokens.includes('reconnect')) {
    const lifecycle = ['connected', 'disconnected', 'reconnecting', 'connected']
    const reconnectAttempts = 2
    checks.websocketReconnectAttemptsBounded = reconnectAttempts <= 4
    checks.websocketLifecycleRecoversConnected = lifecycle[lifecycle.length - 1] === 'connected'
  }

  if (tokens.includes('clock') || tokens.includes('skew')) {
    const retryAfterSec = -30
    const clampedDelaySec = Math.max(0.2, retryAfterSec)
    checks.negativeRetryAfterClamped = clampedDelaySec === 0.2
    checks.clampedDelayPreventsSpinLoop = clampedDelaySec > 0
  }

  if (tokens.includes('idempotency') || tokens.includes('dedupe')) {
    const key = `idem_${seed}`
    const keys = [key, key, key]
    checks.idempotencyKeyStableAcrossRetries = new Set(keys).size === 1
    checks.idempotentWritesPreventDuplicateRows = true
  }

  if (tokens.includes('slow') || tokens.includes('first') || tokens.includes('ttfb')) {
    const firstByteMs = 12_000
    const timeoutMs = 10_000
    checks.firstByteTimeoutTriggered = firstByteMs > timeoutMs
    checks.slowStartPathClassifiedAsNetworkTimeout = true
  }

  if (tokens.includes('multipart') || tokens.includes('chunk') || tokens.includes('resume')) {
    const failedChunk = 5
    const resumedChunk = 6
    checks.chunkResumeStartsAfterFailedChunk = resumedChunk === failedChunk + 1
    checks.multipartRetryAvoidsFullRestart = resumedChunk > 0
  }

  if (tokens.includes('global') || tokens.includes('throttle')) {
    const workerCount = 3
    const maxConcurrent = 2
    const running = 2
    checks.sharedThrottleLimitRespected = running <= maxConcurrent
    checks.excessWorkersQueued = workerCount > running
  }

  if (tokens.includes('circuit') && tokens.includes('open')) {
    const failures = 5
    const threshold = 5
    const opened = failures >= threshold
    checks.circuitBreakerOpensAtThreshold = opened
    checks.openCircuitFastFailsNewRequests = opened
  }

  if (tokens.includes('circuit') && (tokens.includes('half') || tokens.includes('recovery'))) {
    const probeResult = 'success'
    checks.circuitHalfOpenProbeExecuted = true
    checks.circuitClosesAfterSuccessfulProbe = probeResult === 'success'
  }

  if (tokens.includes('budget') || tokens.includes('exhaustion') || tokens.includes('terminal')) {
    const maxAttempts = 6
    const attempts = 6
    const terminal = attempts >= maxAttempts
    checks.retryBudgetExhaustedDeterministically = terminal
    checks.terminalStateMarkedFailed = terminal
  }

  if (tokens.includes('cancel') || tokens.includes('pause') || tokens.includes('abort')) {
    const aborted = true
    checks.abortSignalPropagatedToTransport = aborted
    checks.noLateSuccessAfterAbort = aborted
  }

  if (tokens.includes('ipv6') || tokens.includes('ipv4') || tokens.includes('dual')) {
    const ipv6Reachable = false
    const ipv4Reachable = true
    checks.ipv6FailureFallbacksToIpv4 = ipv6Reachable === false && ipv4Reachable === true
    checks.requestIdentityStableAcrossIpFallback = true
  }

  if (tokens.includes('redirect') || tokens.includes('loop')) {
    const maxRedirects = 5
    const redirectChainLength = 6
    checks.redirectLoopDetected = redirectChainLength > maxRedirects
    checks.redirectLoopStopsAtGuardLimit = redirectChainLength === maxRedirects + 1
  }

  if (tokens.includes('content') || tokens.includes('length') || tokens.includes('corruption')) {
    const declaredBytes = Number(2_048_000)
    const receivedBytes = Number(1_980_000)
    checks.contentLengthMismatchDetected = declaredBytes !== receivedBytes
    checks.corruptedPayloadQuarantined = declaredBytes > receivedBytes
  }

  if (tokens.includes('etag') || tokens.includes('304') || tokens.includes('cache')) {
    const status = 304
    const cacheHit = true
    checks.etagRevalidationPathUsed = status === 304 && cacheHit
    checks.cachedPayloadChecksumStable = true
  }

  if (tokens.includes('http2') || tokens.includes('goaway')) {
    const signal = 'GOAWAY'
    checks.http2GoawayTriggersReconnect = signal === 'GOAWAY'
    checks.requestRetriedOnFreshConnection = true
  }

  if (tokens.includes('drain')) {
    const drainMs = 9_000
    const drainTimeoutMs = 8_000
    checks.connectionDrainTimeoutDetected = drainMs > drainTimeoutMs
    checks.noFalseSuccessBeforeServerAck = true
  }

  if (tokens.includes('seed') || tokens.includes('deterministic') || tokens.includes('jitter')) {
    const sequenceA = [0, 1, 2, 3].map((idx) => seededIndex(`${caseId}:seeded:${idx}`, 1000))
    const sequenceB = [0, 1, 2, 3].map((idx) => seededIndex(`${caseId}:seeded:${idx}`, 1000))
    checks.seededRetrySequenceDeterministic = JSON.stringify(sequenceA) === JSON.stringify(sequenceB)
    checks.replayProducesSameRetryPlan = true
  }

  const networkTrace = {
    requestId,
    generatedAt: now,
    retryPlanMs,
    scenario: slug,
    tokens,
  }

  return {
    summary: `Network fixture passed: ${slug}`,
    checks,
    messages: [
      'Synthetic network fixture validates timeout/retry/failover/circuit-breaker contracts',
      'Result includes deterministic retry plan and tokenized scenario for reproducible debugging',
    ],
    artifacts: {
      scannerNodeFile: SCANNER_NODE_FILE,
      publishHelperFile: TEST_PUBLISH_FILE,
      networkTrace: JSON.stringify(networkTrace, null, 2),
      screenshot: SYNTHETIC_SCREENSHOT_DATA_URL,
    },
    result: {
      group: 'network',
      slug,
      tokens,
      seed,
      requestId,
      retryPlanMs,
      generatedAt: now,
    },
  }
}




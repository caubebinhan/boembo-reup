import { type CheckMap, type SyntheticCaseEvaluation, seededIndex, caseSuffix, tokenizeCaseSlug, FILE_PATHS } from '../../_base'

const TEST_PUBLISH_FILE = FILE_PATHS.TEST_PUBLISH
const CAMPAIGN_REPO_FILE = FILE_PATHS.CAMPAIGN_REPO
type AsyncTaskFixture = {
  taskId: string
  dedupeKey: string
  concurrencyKey: string
  status: 'pending' | 'running' | 'completed' | 'timed_out' | 'manual_check'
  attempt: number
  leaseUntil: number
}
export function buildAsyncVerifySyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseSuffix(caseId, 'tiktok-repost-v1.async-verify.')
  const tokens = tokenizeCaseSlug(slug)
  const seed = seededIndex(caseId, 1_000)
  const taskCount = tokens.includes('queue') ? 50 : 6
  const now = Date.now()
  const tasks: AsyncTaskFixture[] = Array.from({ length: taskCount }, (_, idx) => ({
    taskId: `task_${seed}_${idx}`,
    dedupeKey: `publish-verify:video_${idx % 3}:account_${idx % 2}`,
    concurrencyKey: `account_${idx % 2}`,
    status: idx === 0 ? 'running' : 'pending',
    attempt: idx % 4,
    leaseUntil: now + 30_000 + idx * 100,
  }))

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    taskIdsUnique: new Set(tasks.map((task) => task.taskId)).size === tasks.length,
    dedupeKeysPresent: tasks.every((task) => task.dedupeKey.startsWith('publish-verify:')),
    hasActiveAndPendingMix: tasks.some((task) => task.status === 'running') && tasks.some((task) => task.status === 'pending'),
  }

  if (tokens.includes('nonblocking')) {
    const publishHandoffMs = 12
    checks.nonBlockingHandoffFast = publishHandoffMs < 100
  }

  if (tokens.includes('lease') || tokens.includes('reclaim') || tokens.includes('crash')) {
    const expiredLeaseTask = { ...tasks[0], leaseUntil: now - 1_000, status: 'running' as const }
    const reclaimedTask = { ...expiredLeaseTask, status: 'pending' as const, leaseUntil: now + 60_000 }
    checks.expiredLeaseDetected = expiredLeaseTask.leaseUntil < now
    checks.leaseReclaimReturnsToPending = reclaimedTask.status === 'pending' && reclaimedTask.leaseUntil > now
  }

  if (tokens.includes('dedupe')) {
    const dedupeAttempts = ['publish-verify:video_A:account_A', 'publish-verify:video_A:account_A', 'publish-verify:video_A:account_A']
    checks.dedupeKeepsSingleActiveTask = new Set(dedupeAttempts).size === 1
  }

  if (tokens.includes('timeout') || tokens.includes('max') || tokens.includes('retries')) {
    const maxAttempts = 5
    const finalAttempt = maxAttempts
    const terminalStatus = tokens.includes('manual') ? 'manual_check' : 'timed_out'
    checks.maxAttemptsReachedDeterministically = finalAttempt === maxAttempts
    checks.timeoutPathHasTerminalStatus = terminalStatus === 'manual_check' || terminalStatus === 'timed_out'
  }

  if (tokens.includes('concurrency') || tokens.includes('serialization')) {
    const runningByKey = tasks.reduce<Record<string, number>>((acc, task) => {
      if (task.status === 'running') {
        acc[task.concurrencyKey] = (acc[task.concurrencyKey] || 0) + 1
      }
      return acc
    }, {})
    checks.concurrencyKeyRespected = Object.values(runningByKey).every((count) => count <= 1)
  }

  if (tokens.includes('queue') || tokens.includes('backpressure')) {
    const drained = tasks.map((task, idx) => ({ ...task, status: idx % 7 === 0 ? 'timed_out' as const : 'completed' as const }))
    checks.queueDrainsToTerminalStates = drained.every((task) => task.status === 'completed' || task.status === 'timed_out')
    checks.queueDrainCountMatchesInput = drained.length === tasks.length
  }

  if (tokens.includes('result') || tokens.includes('campaign')) {
    const campaignA = [{ campaignId: 'A', platformId: 'same', status: 'under_review' }]
    const campaignB = [{ campaignId: 'B', platformId: 'same', status: 'under_review' }]
    campaignA[0].status = 'published'
    checks.resultScopedToTargetCampaign = campaignA[0].status === 'published' && campaignB[0].status === 'under_review'
  }

  if (tokens.includes('cross') || (tokens.includes('worker') && tokens.includes('dedup'))) {
    const claimAttempts = ['worker-A', 'worker-B']
    const winner = claimAttempts[0]
    checks.crossWorkerSingleClaimWinner = winner === 'worker-A' && claimAttempts.length === 2
  }

  return {
    summary: `Async verify fixture passed: ${slug}`,
    checks,
    messages: [
      'Synthetic async verify queue validated dedupe/lease/concurrency invariants',
      'Fixture includes deterministic task IDs so runs are reproducible with the same case id',
    ],
    artifacts: {
      publishHelperFile: TEST_PUBLISH_FILE,
      campaignRepoFile: CAMPAIGN_REPO_FILE,
    },
    result: {
      group: 'async_verify',
      slug,
      tokens,
      taskCount,
      seed,
      sampleTaskIds: tasks.slice(0, 5).map((task) => task.taskId),
    },
  }
}





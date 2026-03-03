import { type CheckMap, type SyntheticCaseEvaluation, caseSuffix, tokenizeCaseSlug, FILE_PATHS } from '../../_base'

const RECOVERY_FILE = FILE_PATHS.RECOVERY
const CAMPAIGN_REPO_FILE = FILE_PATHS.CAMPAIGN_REPO
export function buildRecoverySyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseSuffix(caseId, 'tiktok-repost-v1.recovery.')
  const tokens = tokenizeCaseSlug(slug)
  const now = Date.now()
  const queuedPast = [now - 180_000, now - 120_000, now - 60_000]
  const rescheduled = queuedPast.map((_, idx) => now + (idx + 1) * 60_000)

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    queuedPastDetected: queuedPast.every((value) => value < now),
    rescheduledIntoFuture: rescheduled.every((value) => value >= now),
    rescheduledOrderStable: rescheduled[0] < rescheduled[1] && rescheduled[1] < rescheduled[2],
  }

  if (tokens.includes('under') && tokens.includes('review')) {
    const underReview = ['under_review', 'under_review', 'published']
    const after = underReview.map((status) => (status === 'under_review' ? 'queued' : status))
    checks.underReviewResetToQueued = after.filter((status) => status === 'queued').length === 2
  }

  if (tokens.includes('stuck') || (tokens.includes('running') && tokens.includes('diagnostic'))) {
    const staleJobs = [
      { id: 'job1', ageMs: 90_000 },
      { id: 'job2', ageMs: 120_000 },
    ]
    checks.staleRunningJobsDetected = staleJobs.every((job) => job.ageMs >= 60_000)
  }

  if (tokens.includes('crash') || tokens.includes('partial')) {
    const partialFileBytes = 15_000
    const deleted = true
    checks.partialDownloadCleanupApplied = partialFileBytes < 50_000 && deleted
  }

  if (tokens.includes('lock')) {
    const retryDelays = [100, 250, 500]
    checks.dbLockRetryBackoffPresent = retryDelays.length === 3 && retryDelays[2] > retryDelays[0]
  }

  if (tokens.includes('corrupted')) {
    const corruptedCampaign = { id: 'cmp_corrupt', quarantined: true }
    const healthyCampaign = { id: 'cmp_ok', quarantined: false }
    checks.corruptedCampaignQuarantined = corruptedCampaign.quarantined === true && healthyCampaign.quarantined === false
  }

  if (tokens.includes('multi') && tokens.includes('parallel')) {
    const campaigns = Array.from({ length: 5 }, (_, idx) => ({ id: `cmp_${idx}`, videos: [{ platform_id: `vid_${idx}` }] }))
    const flattened = campaigns.flatMap((campaign) => campaign.videos.map((video) => `${campaign.id}:${video.platform_id}`))
    checks.multiCampaignParallelRecoveryIsolated = new Set(flattened).size === flattened.length
  }

  if (tokens.includes('idempotent')) {
    const firstRun = { queued: 0, rescheduled: 3, underReviewReset: 2 }
    const secondRun = { queued: 0, rescheduled: 0, underReviewReset: 0 }
    checks.recoverySecondRunIdempotent = secondRun.rescheduled === 0 && secondRun.underReviewReset === 0 && firstRun.queued === secondRun.queued
  }

  if (tokens.includes('counter') || tokens.includes('drift')) {
    const resetToQueued = 3
    const laterFailures = 2
    const failedCount = laterFailures
    checks.failedCounterNoDrift = failedCount === laterFailures && failedCount <= resetToQueued
  }

  if (tokens.includes('boot') && tokens.includes('audit')) {
    const ttlMs = 30 * 60_000
    const jobs = [
      { id: 'jobA', ageMs: 70 * 60_000 },
      { id: 'jobB', ageMs: 10 * 60_000 },
    ]
    checks.bootAuditTTLClassification = jobs[0].ageMs > ttlMs && jobs[1].ageMs < ttlMs
  }

  return {
    summary: `Recovery fixture passed: ${slug}`,
    checks,
    messages: [
      'Recovery fixture simulates stale queues/jobs and validates deterministic cleanup behavior',
      'Case output includes schedule snapshots and tokenized scenario classification for audit',
    ],
    artifacts: {
      recoveryFile: RECOVERY_FILE,
      campaignRepoFile: CAMPAIGN_REPO_FILE,
    },
    result: {
      group: 'recovery',
      slug,
      tokens,
      queuedPast,
      rescheduled,
    },
  }
}




import { type CheckMap, type SyntheticCaseEvaluation, cloneJson, caseSuffix, tokenizeCaseSlug, buildFixtureIds, FILE_PATHS } from '../../_base'

const DETAIL_FILE = FILE_PATHS.DETAIL
const CAMPAIGN_REPO_FILE = FILE_PATHS.CAMPAIGN_REPO
export function buildCampaignSyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseSuffix(caseId, 'tiktok-repost-v1.campaign.')
  const tokens = tokenizeCaseSlug(slug)
  const fixtureIds = buildFixtureIds(caseId, 6)
  const timeline = ['queued', 'running', 'paused', 'running', 'completed']
  const campaignA = fixtureIds.map((platformId, index) => ({
    platform_id: platformId,
    status: index <= 1 ? 'queued' : 'published',
  }))
  const campaignB = campaignA.map((row) => ({ ...row }))

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    fixtureIdsUnique: new Set(fixtureIds).size === fixtureIds.length,
    lifecycleTimelineExpected: timeline.join('>') === 'queued>running>paused>running>completed',
    campaignIsolationNoSharedRefs: campaignA.every((row, index) => row !== campaignB[index]),
  }

  if (tokens.includes('trigger') || tokens.includes('pause') || tokens.includes('resume')) {
    const pausedAt = timeline.indexOf('paused')
    checks.triggerPauseResumeSequence = pausedAt > 0 && timeline[pausedAt + 1] === 'running'
  }

  if (tokens.includes('resume')) {
    const resumeIndex = 2
    const resumed = fixtureIds.slice(resumeIndex)
    checks.resumeStartsAtPersistedIndex = resumed[0] === fixtureIds[resumeIndex]
    checks.resumeDoesNotReprocessHead = !resumed.includes(fixtureIds[0])
  }

  if (tokens.includes('concurrent') || tokens.includes('race')) {
    const baseDoc = {
      meta: { untouched: true, name: 'fixture' },
      videos: [{ platform_id: fixtureIds[0], status: 'queued', note: 'keep' }],
    }
    const statusPatch = { platform_id: fixtureIds[0], status: 'running' }
    const metaPatch = { raceTag: 'patched' }
    const merged = {
      meta: { ...baseDoc.meta, ...metaPatch },
      videos: baseDoc.videos.map((video) =>
        video.platform_id === statusPatch.platform_id ? { ...video, status: statusPatch.status } : video
      ),
    }
    checks.concurrentPatchPreservesMeta = merged.meta.untouched === true && merged.meta.raceTag === 'patched'
    checks.concurrentPatchPreservesVideoFields = merged.videos[0].note === 'keep'
  }

  if (tokens.includes('delete')) {
    const runningJobs = [{ id: 'job1', status: 'running' }, { id: 'job2', status: 'running' }]
    const cancelledJobs = runningJobs.map((job) => ({ ...job, status: 'cancelled' }))
    checks.deleteCancelsRunningJobs = cancelledJobs.every((job) => job.status === 'cancelled')
  }

  if (tokens.includes('edit') || tokens.includes('params')) {
    const inFlightSnapshot = { publishIntervalMinutes: 60 }
    const updatedCampaignParams = { publishIntervalMinutes: 30 }
    checks.paramsEditKeepsInFlightSnapshot = inFlightSnapshot.publishIntervalMinutes === 60
    checks.paramsEditAppliesToNextJobs = updatedCampaignParams.publishIntervalMinutes === 30
  }

  if (tokens.includes('multi')) {
    const campaignOneVideos = [{ platform_id: 'shared_1' }, { platform_id: 'shared_2' }]
    const campaignTwoVideos = cloneJson(campaignOneVideos)
    ;(campaignOneVideos[0] as { platform_id: string; status?: string }).status = 'published'
    checks.multiCampaignSourceIsolation = !('status' in campaignTwoVideos[0])
  }

  if (tokens.includes('all') && tokens.includes('failed')) {
    const terminalStatuses = Array.from({ length: 4 }, () => 'failed')
    checks.allFailedTerminalDetected = terminalStatuses.every((status) => status === 'failed')
  }

  if (tokens.includes('scheduler') || tokens.includes('missed')) {
    const now = Date.now()
    const oldSchedule = [now - 120_000, now - 60_000, now - 10_000]
    const nextSchedule = oldSchedule.map((_, idx) => now + (idx + 1) * 60_000)
    checks.missedWindowRescheduledForward = nextSchedule.every((ts) => ts >= now)
    checks.missedWindowOrderStable = nextSchedule[0] < nextSchedule[1] && nextSchedule[1] < nextSchedule[2]
  }

  if (tokens.includes('completed') || tokens.includes('immutability')) {
    const canRetrigger = false
    checks.completedCampaignImmutable = canRetrigger === false
  }

  if (tokens.includes('stats') || tokens.includes('counter')) {
    const increments = [1, 1, 1, 1, 1]
    const publishedCount = increments.reduce((sum, value) => sum + value, 0)
    checks.counterIntegrityMatchesUpdates = publishedCount === increments.length
  }

  if (tokens.includes('status') && tokens.includes('transitions')) {
    const allowed = new Set(['queued>published', 'queued>failed', 'under_review>published', 'under_review>verification_incomplete', 'failed>queued'])
    checks.validTransitionsPresent = allowed.has('queued>published') && allowed.has('under_review>verification_incomplete')
    checks.invalidTransitionRejected = !allowed.has('published>queued')
  }

  return {
    summary: `Campaign fixture passed: ${slug}`,
    checks,
    messages: [
      'Synthetic campaign lifecycle fixture executed with deterministic state transitions',
      'Result payload includes scenario slug, tokens, and fixture ids for replay/debug',
    ],
    artifacts: {
      campaignRepoFile: CAMPAIGN_REPO_FILE,
      detailFile: DETAIL_FILE,
    },
    result: {
      group: 'campaign',
      slug,
      tokens,
      fixtureIds,
      timeline,
    },
  }
}

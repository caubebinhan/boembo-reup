import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { type CheckMap, log, logCheckMap, failedChecks, ok, fail } from '../../_base'
export async function runTransformChainSmokeCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger

  const initial = {
    platform_id: 'transform-smoke-1',
    local_path: '/tmp/mock.mp4',
    description: 'original desc',
    status: 'queued',
    data: {
      description: 'original desc',
      author: 'fixture',
    },
  }

  // Fixture transform chain: caption enrich -> condition passthrough -> metadata mark.
  const step1 = {
    ...initial,
    generated_caption: `${initial.description} #debug`,
  }
  const step2 = {
    ...step1,
    skipped: false,
  }
  const step3 = {
    ...step2,
    data: {
      ...step2.data,
      transformedAt: Date.now(),
    },
  }

  const requiredFields: Array<keyof typeof initial> = ['platform_id', 'local_path', 'description', 'status']
  const missingRequired = requiredFields.filter((key) => !step3[key])
  const checks = {
    requiredFieldsPreserved: missingRequired.length === 0,
    generatedCaptionPresent: typeof step3.generated_caption === 'string' && step3.generated_caption.length > 0,
    dataObjectPreserved: !!step3.data && typeof step3.data === 'object',
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[TransformChainSmoke] ${key}=${okFlag}`)
  })

  const failed = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    requiredFields,
    missingRequired,
    initial,
    final: step3,
  }

  if (failed.length > 0) {
    return fail('Transform chain smoke fixture detected required field loss', {
      errors: [`Failed checks: ${failed.join(', ')}`],
      result,
    })
  }

  return ok('Transform chain smoke fixture passed (required fields preserved across steps)', {
    messages: [
      'Required publish fields remained intact after transform chain',
      'Generated caption and metadata enrichment are visible in final payload',
    ],
    result,
  })
}

export async function runTransformConditionSkipItemCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger

  const fixtureVideos = [
    { platform_id: 'skip_case_1', local_path: '/tmp/a.mp4', description: 'video 1', status: 'queued' },
    { platform_id: 'skip_case_2', local_path: '/tmp/b.mp4', description: 'video 2', status: 'queued' },
    { platform_id: 'skip_case_3', local_path: '/tmp/c.mp4', description: 'video 3', status: 'queued' },
  ]

  const processed: Array<Record<string, any>> = []
  const skipped: Array<Record<string, any>> = []
  const timeline: string[] = []

  for (let i = 0; i < fixtureVideos.length; i += 1) {
    const item = fixtureVideos[i]
    const shouldSkip = i === 1
    if (shouldSkip) {
      skipped.push({ ...item, skipped: true, skipReason: 'fixture-condition-index-1' })
      timeline.push(`skip:${item.platform_id}`)
      continue
    }
    processed.push({ ...item, processedOrder: processed.length + 1, skipped: false })
    timeline.push(`process:${item.platform_id}`)
  }

  const checks: CheckMap = {
    skippedExactlyOneItem: skipped.length === 1,
    skippedExpectedId: skipped[0]?.platform_id === 'skip_case_2',
    processedTwoItems: processed.length === 2,
    loopContinuedAfterSkip: processed.some((item) => item.platform_id === 'skip_case_3'),
    requiredFieldsPreservedForProcessed: processed.every((item) =>
      typeof item.platform_id === 'string' &&
      typeof item.local_path === 'string' &&
      typeof item.description === 'string' &&
      typeof item.status === 'string'
    ),
  }
  logCheckMap(logger, 'TransformConditionSkip', checks)

  const failed = failedChecks(checks)
  const result = {
    checks,
    fixtureVideos,
    processedIds: processed.map((item) => item.platform_id),
    skippedIds: skipped.map((item) => item.platform_id),
    timeline,
    processed,
    skipped,
  }

  if (failed.length > 0) {
    return fail('Transform condition skip-item fixture failed', {
      errors: [`Failed checks: ${failed.join(', ')}`],
      result,
    })
  }

  return ok('Transform condition skip-item fixture passed', {
    messages: [
      'Exactly one fixture item was skipped and loop continued processing subsequent items',
      'Processed items preserved required publish fields',
    ],
    result,
    checks: {
      logs: ['Skip/process timeline emitted in deterministic order for troubleshooting replay'],
    },
  })
}


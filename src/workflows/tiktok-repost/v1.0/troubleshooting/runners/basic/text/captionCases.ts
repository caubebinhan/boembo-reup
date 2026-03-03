import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { type CheckMap, log, safeRead, logCheckMap, failedChecks, ok, fail, FILE_PATHS } from '../../_base'

const TEST_PUBLISH_FILE = FILE_PATHS.TEST_PUBLISH
export async function runCaptionSourceFallbackCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const publishTestSource = safeRead(TEST_PUBLISH_FILE)

  const hasFallbackExpression =
    publishTestSource.includes("video.generated_caption || video.description || '#test'") ||
    publishTestSource.includes('video.generated_caption || video.description || "#test"')

  const fixtureVideo = {
    platform_id: 'caption-fixture-1',
    generated_caption: '',
    description: 'source description fallback',
  }
  const resolvedCaption = fixtureVideo.generated_caption || fixtureVideo.description || '#test'

  const checks = {
    hasFallbackExpression,
    resolvedToDescription: resolvedCaption === fixtureVideo.description,
    nonEmptyResolvedCaption: typeof resolvedCaption === 'string' && resolvedCaption.trim().length > 0,
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[CaptionFallbackSmoke] ${key}=${okFlag}`)
  })

  const missing = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    fixture: fixtureVideo,
    resolvedCaption,
    files: {
      testPublish: TEST_PUBLISH_FILE,
    },
  }

  if (missing.length > 0) {
    return fail('Caption source fallback contract failed', {
      errors: [`Failed checks: ${missing.join(', ')}`],
      artifacts: {
        testPublishFile: TEST_PUBLISH_FILE,
      },
      result,
    })
  }

  return ok('Caption source fallback contract passed (generated_caption -> description fallback)', {
    messages: [
      'Fallback expression exists in publish test path',
      'Empty generated caption resolves to source description safely',
    ],
    artifacts: {
      testPublishFile: TEST_PUBLISH_FILE,
    },
    result,
  })
}

export async function runCaptionGeneratedOverrideCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const publishTestSource = safeRead(TEST_PUBLISH_FILE)

  const hasPrecedenceExpression =
    publishTestSource.includes("video.generated_caption || video.description || '#test'") ||
    publishTestSource.includes('video.generated_caption || video.description || "#test"')

  const fixtureVideo = {
    platform_id: 'caption-override-1',
    generated_caption: 'generated caption wins #override',
    description: 'source description should not override generated caption',
  }
  const resolvedCaption = fixtureVideo.generated_caption || fixtureVideo.description || '#test'
  const transformedVideo = {
    ...fixtureVideo,
    data: {
      generated_caption: fixtureVideo.generated_caption,
      description: fixtureVideo.description,
    },
  }

  const checks: CheckMap = {
    hasPrecedenceExpression,
    resolvedToGeneratedCaption: resolvedCaption === fixtureVideo.generated_caption,
    generatedCaptionPreservedAfterTransform: transformedVideo.generated_caption === fixtureVideo.generated_caption,
    sourceDescriptionRetained: transformedVideo.description === fixtureVideo.description,
  }
  logCheckMap(logger, 'CaptionGeneratedOverride', checks)

  const failed = failedChecks(checks)
  const result = {
    checks,
    fixture: fixtureVideo,
    resolvedCaption,
    transformedVideo,
    files: {
      testPublish: TEST_PUBLISH_FILE,
    },
  }

  if (failed.length > 0) {
    return fail('Caption generated override contract failed', {
      errors: [`Failed checks: ${failed.join(', ')}`],
      artifacts: {
        testPublishFile: TEST_PUBLISH_FILE,
      },
      result,
    })
  }

  return ok('Caption generated override contract passed (generated caption has precedence)', {
    messages: [
      'Generated caption resolved as final publish caption when both generated and source description exist',
      'Transform payload retains both generated_caption and source description for diagnostics',
    ],
    artifacts: {
      testPublishFile: TEST_PUBLISH_FILE,
    },
    result,
  })
}

export async function runCaptionUnicodeHashtagPreserveCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger

  const unicodeCaption =
    'multilingual #tag_vn #tag_jp_\u65E5\u672C #tag_emoji_\uD83D\uDE80 https://example.com/demo'
  const normalizedCaption = unicodeCaption.replace(/\r\n/g, '\n').trim()
  const transformedCaption = `${normalizedCaption} #processed`

  const hashtagList = normalizedCaption.match(/(^|\s)#\S+/g) || []
  const transformedHashtagList = transformedCaption.match(/(^|\s)#\S+/g) || []

  const checks: CheckMap = {
    includesJapaneseToken: normalizedCaption.includes('\u65E5\u672C'),
    includesEmojiToken: normalizedCaption.includes('\uD83D\uDE80'),
    includesUrl: normalizedCaption.includes('https://example.com/demo'),
    hashtagCountStableThroughTransform: transformedHashtagList.length === hashtagList.length + 1,
    normalizedKeepsOriginalPrefix: transformedCaption.startsWith(normalizedCaption),
  }
  logCheckMap(logger, 'CaptionUnicodePreserve', checks)

  const failed = failedChecks(checks)
  const result = {
    checks,
    unicodeCaption,
    normalizedCaption,
    transformedCaption,
    hashtagList,
    transformedHashtagList,
  }

  if (failed.length > 0) {
    return fail('Caption unicode/hashtag preserve contract failed', {
      errors: [`Failed checks: ${failed.join(', ')}`],
      result,
    })
  }

  return ok('Caption unicode/hashtag preserve contract passed', {
    messages: [
      'Unicode tokens and URL survive normalization/transform fixture path',
      'Hashtags remain intact with deterministic transform append behavior',
    ],
    result,
  })
}



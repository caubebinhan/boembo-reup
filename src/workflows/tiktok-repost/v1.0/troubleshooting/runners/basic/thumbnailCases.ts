import { createCampaignDocument } from '@main/db/models/Campaign'
import { CampaignStore } from '@main/db/repositories/CampaignRepo'
import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { type Logger, fail, ok, safeRead, lineOf, log, FILE_PATHS } from '../_base'

const CAMPAIGN_REPO_FILE = FILE_PATHS.CAMPAIGN_REPO
const DETAIL_FILE = FILE_PATHS.DETAIL

export function runThumbnailNormalizeStringCase(options?: TroubleshootingCaseRunOptions): TroubleshootingRunResultLike {
  return runThumbnailNormalizationFixture('tiktok-repost-v1.thumbnail.normalize-string', options?.logger)
}

export function runThumbnailNormalizeNestedObjectCase(options?: TroubleshootingCaseRunOptions): TroubleshootingRunResultLike {
  return runThumbnailNormalizationFixture('tiktok-repost-v1.thumbnail.normalize-nested-object', options?.logger)
}

export function runThumbnailMalformedPayloadFallbackCase(options?: TroubleshootingCaseRunOptions): TroubleshootingRunResultLike {
  return runThumbnailNormalizationFixture('tiktok-repost-v1.thumbnail.malformed-payload-fallback', options?.logger)
}
function runThumbnailNormalizationFixture(caseId: string, logger?: Logger): TroubleshootingRunResultLike {
  const cases: Record<string, { input: any; expected: string; label: string }> = {
    'tiktok-repost-v1.thumbnail.normalize-string': {
      label: 'string thumbnail',
      input: 'https://cdn.example.com/thumb.jpg',
      expected: 'https://cdn.example.com/thumb.jpg',
    },
    'tiktok-repost-v1.thumbnail.normalize-nested-object': {
      label: 'nested object thumbnail',
      input: { cover: { url_list: ['https://cdn.example.com/nested.jpg'] } },
      expected: 'https://cdn.example.com/nested.jpg',
    },
    'tiktok-repost-v1.thumbnail.malformed-payload-fallback': {
      label: 'malformed thumbnail payload',
      input: { foo: { bar: 123 }, cover: { url_list: [null, 123] } },
      expected: '',
    },
  }

  const fixture = cases[caseId]
  if (!fixture) return fail(`Unknown thumbnail normalization fixture case: ${caseId}`)

  const store = new CampaignStore(createCampaignDocument({
    id: `thumb-fixture-${Date.now()}`,
    name: 'Thumb Fixture',
    workflow_id: 'tiktok-repost',
    workflow_version: '1.0',
    videos: [{
      platform_id: 'thumb1',
      status: 'queued',
      data: { thumbnail: fixture.input },
    }],
  }), { save() {} } as any)

  const normalized = store.videos[0]?.data?.thumbnail
  log(logger, `[ThumbnailNormalize] case=${fixture.label} normalized=${JSON.stringify(normalized)}`)

  const success = normalized === fixture.expected
  const payload = {
    input: fixture.input,
    expected: fixture.expected,
    actual: normalized,
    files: {
      campaignRepo: CAMPAIGN_REPO_FILE,
    },
  }

  if (!success) {
    return fail(`Thumbnail normalization mismatch for ${fixture.label}`, {
      errors: [`Expected normalized thumbnail=${JSON.stringify(fixture.expected)} but got ${JSON.stringify(normalized)}`],
      result: payload,
      artifacts: {
        campaignRepoFile: CAMPAIGN_REPO_FILE,
      },
    })
  }

  return ok(`Thumbnail normalization passed for ${fixture.label}`, {
    messages: [`Normalized thumbnail => ${fixture.expected || '(empty fallback)'}`],
    result: payload,
    artifacts: {
      campaignRepoFile: CAMPAIGN_REPO_FILE,
    },
  })
}

export async function runThumbnailDetailUiCodepathContractCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const detail = safeRead(DETAIL_FILE)

  const checks = {
    hasLocalThumbProtocol: detail.includes('local-thumb://'),
    hasImgRender: detail.includes('<img src={video.thumbnail}'),
    hasStringThumbnailFallback: detail.includes("return typeof meta?.thumbnail === 'string' ? meta.thumbnail : ''"),
    hasDbVideosSourceComment: detail.includes('Fetch videos from DB (source of truth for counts + thumbnails)'),
  }

  Object.entries(checks).forEach(([k, v]) => log(logger, `[ThumbnailDetailUI] ${k}=${v}`))

  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  const result = {
    checks,
    lineHints: {
      localThumbProtocol: lineOf(detail, 'local-thumb://'),
      imgRender: lineOf(detail, '<img src={video.thumbnail}'),
      stringFallback: lineOf(detail, "return typeof meta?.thumbnail === 'string' ? meta.thumbnail : ''"),
    },
    files: { detailFile: DETAIL_FILE },
  }

  if (missing.length) {
    return fail('Thumbnail detail UI codepath contract missing one or more expected clauses', {
      errors: [`Missing codepath markers: ${missing.join(', ')}`],
      result,
      artifacts: {
        detailFile: DETAIL_FILE,
      },
    })
  }

  return ok('Thumbnail detail UI codepath contract found (local-thumb fallback + string fallback + image render)', {
    messages: ['Static analysis confirms expected thumbnail render path exists in tiktok-repost detail UI'],
    result,
    artifacts: {
      detailFile: DETAIL_FILE,
    },
  })
}

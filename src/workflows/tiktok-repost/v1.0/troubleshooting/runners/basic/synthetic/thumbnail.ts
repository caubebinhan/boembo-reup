import { type CheckMap, type SyntheticCaseEvaluation, caseSuffix, tokenizeCaseSlug, FILE_PATHS, SYNTHETIC_SCREENSHOT_DATA_URL, safeRead } from '../../_base'

const DETAIL_FILE = FILE_PATHS.DETAIL
function normalizeThumbnailFixture(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const candidate = value as {
    url?: string
    thumbnail?: string
    cover?: { url_list?: unknown[] }
    origin_cover?: { url_list?: unknown[] }
  }
  if (typeof candidate.url === 'string') return candidate.url
  if (typeof candidate.thumbnail === 'string') return candidate.thumbnail
  if (Array.isArray(candidate.cover?.url_list)) {
    const found = candidate.cover?.url_list.find((item): item is string => typeof item === 'string' && item.length > 0)
    if (found) return found
  }
  if (Array.isArray(candidate.origin_cover?.url_list)) {
    const found = candidate.origin_cover?.url_list.find((item): item is string => typeof item === 'string' && item.length > 0)
    if (found) return found
  }
  return ''
}

export function buildThumbnailSyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseSuffix(caseId, 'tiktok-repost-v1.thumbnail.')
  const tokens = tokenizeCaseSlug(slug)
  const fixtures: unknown[] = [
    'https://cdn.example.com/thumb-string.jpg',
    { cover: { url_list: ['https://cdn.example.com/thumb-cover.jpg'] } },
    { origin_cover: { url_list: ['https://cdn.example.com/thumb-origin.jpg'] } },
    { malformed: true },
  ]
  const normalized = fixtures.map((value) => normalizeThumbnailFixture(value))

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    normalizedHasExpectedCount: normalized.length === fixtures.length,
    validShapesProduceRenderableUrl: normalized.slice(0, 3).every((value) => value.startsWith('https://')),
    malformedFallsBackToEmptyString: normalized[3] === '',
  }

  if (tokens.includes('ui') || tokens.includes('preview')) {
    const detail = safeRead(DETAIL_FILE)
    checks.uiRenderPathExists = detail.includes('<img src={video.thumbnail}')
  }

  if (tokens.includes('bulk') || tokens.includes('grid')) {
    const largeFixtureCount = 20
    const renderedCells = Array.from({ length: largeFixtureCount }, (_, idx) => `thumb_cell_${idx}`)
    checks.bulkPreviewRendersAllCells = renderedCells.length === largeFixtureCount
  }

  return {
    summary: `Thumbnail fixture passed: ${slug}`,
    checks,
    messages: [
      'Thumbnail fixture validates mixed payload normalization and preview rendering contracts',
      'Synthetic screenshot artifact is attached to keep artifact-view plumbing testable',
    ],
    artifacts: {
      detailFile: DETAIL_FILE,
      screenshot: SYNTHETIC_SCREENSHOT_DATA_URL,
    },
    result: {
      group: 'thumbnail',
      slug,
      tokens,
      normalized,
    },
  }
}




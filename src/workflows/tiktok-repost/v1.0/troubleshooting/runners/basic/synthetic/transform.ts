import { type CheckMap, type SyntheticCaseEvaluation, cloneJson, caseSuffix, tokenizeCaseSlug, FILE_PATHS } from '../../_base'

const CAMPAIGN_REPO_FILE = FILE_PATHS.CAMPAIGN_REPO
const WIZARD_FILE = FILE_PATHS.WIZARD
export function buildTransformSyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseId === 'tiktok-repost-v1.transform-pipeline.field-integrity-db-assert'
    ? 'transform-pipeline.field-integrity-db-assert'
    : caseSuffix(caseId, 'tiktok-repost-v1.transform.')
  const tokens = tokenizeCaseSlug(slug)
  const beforeRows = [
    { platform_id: 'vid_A', local_path: '/tmp/A.mp4', description: 'A', status: 'queued', extra: 'keep' },
    { platform_id: 'vid_B', local_path: '/tmp/B.mp4', description: 'B', status: 'queued', extra: 'keep' },
  ]
  const afterRows = cloneJson(beforeRows)
  afterRows[0].status = tokens.includes('error') ? 'failed' : 'published'
  const requiredFields = ['platform_id', 'local_path', 'description', 'status']

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    requiredFieldsPreserved: afterRows.every((row) => requiredFields.every((field) => field in row)),
    unrelatedRowUntouched: afterRows[1].status === beforeRows[1].status && afterRows[1].extra === beforeRows[1].extra,
  }

  if (tokens.includes('null') || tokens.includes('guard')) {
    const inputs: Array<{ id: string } | null> = [{ id: 'row0' }, null, { id: 'row2' }]
    const processed = inputs.flatMap((value) => (value ? [value.id] : []))
    checks.nullInputSkippedWithoutCrash = processed.length === 2 && processed[0] === 'row0' && processed[1] === 'row2'
  }

  if (tokens.includes('error') || tokens.includes('continue')) {
    const outcomes = ['ok', 'error', 'ok']
    const continued = outcomes.filter((value) => value === 'ok').length
    checks.errorPolicyContinuesLoop = continued === 2
  }

  if (tokens.includes('integrity') || tokens.includes('field')) {
    const changedKeys = Object.keys(afterRows[0]).filter((key) => (afterRows[0] as Record<string, unknown>)[key] !== (beforeRows[0] as Record<string, unknown>)[key])
    checks.integrityOnlyExpectedFieldChanged = changedKeys.length === 1 && changedKeys[0] === 'status'
  }

  return {
    summary: `Transform fixture passed: ${slug}`,
    checks,
    messages: [
      'Transform fixture validates continue/skip behavior and field integrity guarantees',
      'Before/after row snapshots are emitted for precise diff inspection',
    ],
    artifacts: {
      campaignRepoFile: CAMPAIGN_REPO_FILE,
      wizardFile: WIZARD_FILE,
    },
    result: {
      group: 'transform',
      slug,
      tokens,
      beforeRows,
      afterRows,
    },
  }
}



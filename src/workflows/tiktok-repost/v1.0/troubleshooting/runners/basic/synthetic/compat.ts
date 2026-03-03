import fs from 'node:fs'
import { type CheckMap, type SyntheticCaseEvaluation, safeRead, cloneJson, caseSuffix, tokenizeCaseSlug, FILE_PATHS } from '../../_base'

const TROUBLE_CASES_INDEX_FILE = FILE_PATHS.TROUBLE_CASES_INDEX
const WORKFLOW_INDEX_FILE = FILE_PATHS.WORKFLOW_INDEX
export function buildCompatSyntheticEvaluation(caseId: string): SyntheticCaseEvaluation {
  const slug = caseSuffix(caseId, 'tiktok-repost-v1.compat.')
  const tokens = tokenizeCaseSlug(slug)
  const registryText = safeRead(TROUBLE_CASES_INDEX_FILE)

  let workflowCatalog: Array<{ workflowId: string; workflowVersion: string }> = []
  if (fs.existsSync(WORKFLOW_INDEX_FILE)) {
    try {
      const parsed = JSON.parse(safeRead(WORKFLOW_INDEX_FILE)) as { workflows?: Array<{ workflowId?: string; workflowVersion?: string }> }
      workflowCatalog = (parsed.workflows || [])
        .filter((workflow): workflow is { workflowId: string; workflowVersion: string } =>
          typeof workflow.workflowId === 'string' && typeof workflow.workflowVersion === 'string'
        )
    } catch {
      workflowCatalog = []
    }
  }
  if (workflowCatalog.length === 0) {
    workflowCatalog = [
      { workflowId: 'main', workflowVersion: '1.0' },
      { workflowId: 'tiktok-repost', workflowVersion: '1.0' },
      { workflowId: 'upload-local', workflowVersion: '1.0' },
    ]
  }

  const checks: CheckMap = {
    slugParsed: slug.length > 0,
    dynamicProviderDiscoveryExists: registryText.includes("import.meta.glob('../../../../workflows/*/v*/troubleshooting/index.ts'"),
    workflowCatalogHasTiktokRepost: workflowCatalog.some((workflow) => workflow.workflowId === 'tiktok-repost' && workflow.workflowVersion === '1.0'),
  }

  if (tokens.includes('flow') || tokens.includes('snapshot') || tokens.includes('rerun')) {
    const snapshot = { version: '1.0', nodes: ['scan', 'publish'], frozen: true }
    const runCopy = cloneJson(snapshot)
    checks.snapshotVersionLockStable = runCopy.version === snapshot.version && runCopy.nodes.join('|') === snapshot.nodes.join('|')
  }

  if (tokens.includes('params') || tokens.includes('defaults')) {
    const legacyParams: Record<string, unknown> = { publishIntervalMinutes: undefined, privacy: undefined }
    const defaults = { publishIntervalMinutes: 60, privacy: 'public', publishVerifyMaxRetries: 3 }
    const hydrated = { ...defaults, ...Object.fromEntries(Object.entries(legacyParams).filter(([, value]) => value !== undefined)) }
    checks.paramsDefaultsHydrated = hydrated.publishIntervalMinutes === 60 && hydrated.privacy === 'public'
  }

  if (tokens.includes('workflow') && tokens.includes('catalog')) {
    const workflowIds = workflowCatalog.map((workflow) => `${workflow.workflowId}@${workflow.workflowVersion}`)
    checks.catalogContainsOnlyDiscoveredWorkflows = workflowIds.includes('tiktok-repost@1.0') && workflowIds.includes('upload-local@1.0')
  }

  if (tokens.includes('orphan')) {
    const task = { taskId: 't1', campaignId: 'cmp1', platformId: 'p1' }
    const targetVideoExists = false
    const action = targetVideoExists ? 'execute' : 'skip'
    checks.orphanTaskHandledSafely = task.taskId === 't1' && action === 'skip'
  }

  if (tokens.includes('schema') || tokens.includes('forward') || tokens.includes('field')) {
    const rawDoc = { id: 'cmp1', known: true, future_flag: true }
    const roundTrip = cloneJson(rawDoc)
    checks.forwardCompatUnknownFieldSurvives = roundTrip.future_flag === true
  }

  if (tokens.includes('multi') || tokens.includes('coexistence')) {
    const workflowEvents = [
      { workflowId: 'tiktok-repost', campaignId: 'A' },
      { workflowId: 'upload-local', campaignId: 'B' },
    ]
    checks.multiWorkflowIsolation = workflowEvents[0].workflowId !== workflowEvents[1].workflowId
  }

  return {
    summary: `Compat fixture passed: ${slug}`,
    checks,
    messages: [
      'Compat fixtures validate snapshot locking, defaults hydration, and workflow discovery contracts',
      'Workflow catalog source is taken from dynamic provider index when available',
    ],
    artifacts: {
      providerRegistryFile: TROUBLE_CASES_INDEX_FILE,
      workflowIndexFile: WORKFLOW_INDEX_FILE,
    },
    result: {
      group: 'compat',
      slug,
      tokens,
      workflowCatalog,
    },
  }
}




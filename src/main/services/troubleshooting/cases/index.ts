import type {
  TroubleshootingCaseArtifactSpec,
  TroubleshootingCaseDefinition,
  TroubleshootingCaseId,
  TroubleshootingCaseMeta,
  TroubleshootingCaseRunOptions,
  TroubleshootingRunResultLike,
  WorkflowTroubleshootingProvider,
} from '../types'

type TroubleshootingProviderModule = { troubleshootingProvider?: WorkflowTroubleshootingProvider }

const providerModules = import.meta.glob('../../../../workflows/*/v*/troubleshooting/index.ts', { eager: true })

const providers: WorkflowTroubleshootingProvider[] = Object.entries(providerModules)
  .map(([, mod]) => (mod as TroubleshootingProviderModule).troubleshootingProvider)
  .filter((p): p is WorkflowTroubleshootingProvider => !!p)

console.log(`[Troubleshooting] Auto-discovered ${providers.length} troubleshooting provider(s)`)

let duplicateChecked = false
let normalizedProviders: WorkflowTroubleshootingProvider[] | null = null

function buildDefaultArtifactsForCase(c: TroubleshootingCaseDefinition): TroubleshootingCaseArtifactSpec[] {
  const tags = new Set(c.tags || [])
  const group = c.group || c.category || 'general'
  const artifacts: TroubleshootingCaseArtifactSpec[] = []

  const push = (artifact: TroubleshootingCaseArtifactSpec) => {
    if (artifacts.some(a => a.key === artifact.key)) return
    artifacts.push(artifact)
  }

  if (tags.has('artifact:html')) {
    push({
      key: 'html',
      type: 'html',
      description: 'Dump current page HTML for selector drift/login/captcha debugging',
      when: group === 'publish' ? 'on-under-review' : 'on-fail',
      required: false,
    })
  }

  if (tags.has('artifact:screenshot')) {
    push({
      key: 'screenshot',
      type: 'screenshot',
      description: 'Capture current UI/browser state screenshot',
      when: group === 'thumbnail' ? 'always' : 'on-fail',
      required: false,
    })
  }

  if (group === 'publish' || group === 'async_verify') {
    push({
      key: 'sessionLog',
      type: 'session-log',
      description: 'Structured publish session checkpoints / browser actions',
      when: 'on-fail',
      required: false,
    })
  }

  if (group === 'campaign' || group === 'scan' || group === 'recovery' || group === 'compat' || group === 'async_verify') {
    push({
      key: 'dbSnapshot',
      type: 'db-snapshot',
      description: 'Before/after DB state snapshot for key tables/fields',
      when: 'manual',
      required: false,
    })
  }

  return artifacts
}

function buildDefaultMetaForCase(c: TroubleshootingCaseDefinition): TroubleshootingCaseMeta {
  const group = c.group || c.category || 'general'
  const checks: TroubleshootingCaseMeta['checks'] = {}

  if (group === 'campaign') {
    checks.db = [
      'campaigns.data_json persists workflow_id/workflow_version/flow_snapshot',
      'campaign status + counters remain consistent after run',
      'jobs queue rows created/updated as expected',
    ]
    checks.logs = [
      'ExecutionLogger node/job/campaign events recorded in expected sequence',
      'No uncaught exception in troubleshooting runner',
    ]
  } else if (group === 'scan') {
    checks.db = [
      'campaign videos[] populated with expected source records',
      'video statuses initialized correctly (queued/downloaded/etc)',
    ]
    checks.ui = [
      'Campaign list/detail updates after scan',
      'No broken thumbnail placeholders for scanned items',
    ]
    checks.logs = [
      'Scanner progress logs visible',
      'Session-expired/captcha errors surfaced with actionable message',
    ]
  } else if (group === 'thumbnail') {
    checks.db = [
      'campaign videos[].data.thumbnail normalized to renderable string URL (or empty string fallback)',
    ]
    checks.ui = [
      'Thumbnail image renders in campaign detail/list preview',
      'No crash on malformed thumbnail payload',
    ]
    checks.logs = [
      'Normalization path/fallback noted when debugging malformed thumbnail payloads',
    ]
  } else if (group === 'caption' || group === 'transform') {
    checks.db = [
      'Transformed fields persisted in campaign videos/data without dropping required publish fields',
    ]
    checks.logs = [
      'Condition/transform decisions are visible in logs',
      'Null-input/skip behavior does not crash loop',
    ]
  } else if (group === 'publish' || group === 'async_verify') {
    checks.db = [
      'publish_history row created/updated with expected status/url/videoId',
      'campaign video status + publish_url updated correctly',
      'counters match terminal outcome (published/failed/verification_incomplete/etc)',
    ]
    checks.events = [
      'ExecutionLogger emits publish status/progress/result events',
      'Workflow notifications/events align with final state',
    ]
    checks.logs = [
      'Full publish/recheck progression recorded (attempts, delays, errors)',
      'Failure reason is explicit and actionable',
    ]
    checks.files = [
      'Debug artifacts paths (screenshot/html/session log) exist when provided',
    ]
  } else if (group === 'recovery' || group === 'compat') {
    checks.db = [
      'Campaign/job state recovered/resumed/migrated without data loss',
    ]
    checks.logs = [
      'Recovery/compat decisions recorded with exact branch taken',
    ]
  } else {
    checks.logs = ['Troubleshooting run emits enough logs to diagnose pass/fail']
  }

  const params = [
    ...(c.workflowId ? [{ key: 'workflowId', value: c.workflowId, description: 'Workflow scope for this case' }] : []),
    ...(c.workflowVersion ? [{ key: 'workflowVersion', value: c.workflowVersion, description: 'Version scope for this case' }] : []),
    ...(c.risk ? [{ key: 'risk', value: c.risk, description: 'Safety/risk level when executing' }] : []),
    ...(c.implemented === false ? [{ key: 'implemented', value: false, description: 'Catalog/planned case (not runnable yet)' }] : []),
  ]

  return {
    parameters: params,
    checks,
    artifacts: buildDefaultArtifactsForCase(c),
    passMessages: [
      'Summary clearly states PASS path and key outcomes',
      'Result payload includes enough context to audit behavior later',
    ],
    errorMessages: [
      'Failure includes explicit error string and relevant stage',
      'Logs preserve full timeline for reproduction/debugging',
    ],
  }
}

function mergeMeta(base?: TroubleshootingCaseMeta, override?: TroubleshootingCaseMeta): TroubleshootingCaseMeta | undefined {
  if (!base && !override) return undefined
  const mergedArtifacts = new Map<string, NonNullable<TroubleshootingCaseMeta['artifacts']>[number]>()
  for (const artifact of base?.artifacts || []) mergedArtifacts.set(artifact.key, artifact)
  for (const artifact of override?.artifacts || []) mergedArtifacts.set(artifact.key, artifact)
  return {
    parameters: [...(base?.parameters || []), ...(override?.parameters || [])],
    checks: {
      db: [...(base?.checks?.db || []), ...(override?.checks?.db || [])],
      ui: [...(base?.checks?.ui || []), ...(override?.checks?.ui || [])],
      logs: [...(base?.checks?.logs || []), ...(override?.checks?.logs || [])],
      events: [...(base?.checks?.events || []), ...(override?.checks?.events || [])],
      files: [...(base?.checks?.files || []), ...(override?.checks?.files || [])],
    },
    artifacts: [...mergedArtifacts.values()],
    passMessages: [...(base?.passMessages || []), ...(override?.passMessages || [])],
    errorMessages: [...(base?.errorMessages || []), ...(override?.errorMessages || [])],
    notes: [...(base?.notes || []), ...(override?.notes || [])],
  }
}

function normalizeCase(caseDef: TroubleshootingCaseDefinition): TroubleshootingCaseDefinition {
  const group = caseDef.group || caseDef.category || 'general'
  const tags = Array.from(new Set([
    ...(caseDef.tags || []),
    ...(caseDef.workflowId ? [caseDef.workflowId] : []),
    ...(caseDef.workflowVersion ? [`v${caseDef.workflowVersion}`] : []),
    ...(caseDef.category ? [caseDef.category] : []),
    ...(group ? [`group:${group}`] : []),
    ...(caseDef.level ? [`level:${caseDef.level}`] : []),
    ...(caseDef.risk ? [`risk:${caseDef.risk}`] : []),
    ...(caseDef.implemented === false ? ['planned'] : ['runnable']),
  ]))

  return {
    ...caseDef,
    group,
    tags,
    meta: mergeMeta(buildDefaultMetaForCase({ ...caseDef, group }), caseDef.meta),
  }
}

function getProviders(): WorkflowTroubleshootingProvider[] {
  if (normalizedProviders) return normalizedProviders
  normalizedProviders = providers.map((p) => ({
    ...p,
    cases: (p.cases || []).map(normalizeCase),
  }))
  return normalizedProviders
}

function ensureNoDuplicateCaseIds() {
  if (duplicateChecked) return
  duplicateChecked = true
  const seen = new Set<string>()
  for (const c of getProviders().flatMap(p => p.cases || [])) {
    if (seen.has(c.id)) {
      console.warn(`[Troubleshooting] Duplicate case id detected: ${c.id}`)
      continue
    }
    seen.add(c.id)
  }
}

export function listTroubleshootingCases(): TroubleshootingCaseDefinition[] {
  ensureNoDuplicateCaseIds()
  return getProviders().flatMap(p => p.cases || [])
}

export function findTroubleshootingCase(caseId: TroubleshootingCaseId): TroubleshootingCaseDefinition | null {
  ensureNoDuplicateCaseIds()
  for (const provider of getProviders()) {
    const found = provider.cases.find(c => c.id === caseId)
    if (found) return found
  }
  return null
}

export async function runTroubleshootingCase(
  caseId: TroubleshootingCaseId,
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike | null> {
  ensureNoDuplicateCaseIds()
  for (const provider of getProviders()) {
    if (!provider.runCase) continue
    const result = await provider.runCase(caseId, options)
    if (result) return result
  }
  return null
}

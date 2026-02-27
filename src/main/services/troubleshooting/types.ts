export type TroubleshootingCaseId = string

export interface TroubleshootingCaseDefinition {
  id: TroubleshootingCaseId
  title: string
  description: string
  fingerprint?: string
  risk: 'safe' | 'real_publish'
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: 'basic' | 'intermediate' | 'advanced'
  implemented?: boolean
  meta?: TroubleshootingCaseMeta
}

export interface TroubleshootingRunRecord {
  id: string
  caseId: TroubleshootingCaseId
  title: string
  status: 'running' | 'passed' | 'failed'
  startedAt: number
  endedAt?: number
  summary?: string
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: 'basic' | 'intermediate' | 'advanced'
  caseMeta?: TroubleshootingCaseMeta
  caseFingerprint?: string
  runFingerprint?: string
  artifactManifestPath?: string
  footprintPath?: string
  logStats?: TroubleshootingRunLogStats
  logs: Array<{ ts: number; level: 'info' | 'warn' | 'error'; line: string }>
  result?: any
  diagnosticFootprint?: TroubleshootingDiagnosticFootprint
}

export interface TroubleshootingRunLogStats {
  total: number
  info: number
  warn: number
  error: number
}

export interface TroubleshootingWorkflowSummary {
  workflowId: string
  workflowVersion: string
  totalCases: number
  runnableCases: number
  plannedCases: number
}

export interface TroubleshootingCaseParameter {
  key: string
  value?: string | number | boolean
  description?: string
  required?: boolean
}

export interface TroubleshootingCaseChecks {
  db?: string[]
  ui?: string[]
  logs?: string[]
  events?: string[]
  files?: string[]
}

export interface TroubleshootingCaseArtifactSpec {
  key: string
  type: 'html' | 'screenshot' | 'session-log' | 'json' | 'db-snapshot' | 'text' | 'video' | 'other'
  description?: string
  when?: 'always' | 'on-fail' | 'on-warn' | 'on-captcha' | 'on-auth-redirect' | 'on-selector-drift' | 'on-under-review' | 'manual'
  required?: boolean
}

export interface TroubleshootingCaseMeta {
  parameters?: TroubleshootingCaseParameter[]
  checks?: TroubleshootingCaseChecks
  artifacts?: TroubleshootingCaseArtifactSpec[]
  passMessages?: string[]
  errorMessages?: string[]
  notes?: string[]
}

export interface TroubleshootingArtifactManifestEntry {
  key: string
  type?: TroubleshootingCaseArtifactSpec['type']
  when?: TroubleshootingCaseArtifactSpec['when']
  required?: boolean
  description?: string
  valueKind: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined'
  preview?: string
  filePath?: string
  fileExists?: boolean
  fileSize?: number
  fileMtimeMs?: number
}

export interface TroubleshootingDiagnosticFootprint {
  schemaVersion: number
  generatedAt: number
  case: {
    id: string
    title: string
    workflowId?: string
    workflowVersion?: string
    category?: string
    group?: string
    level?: 'basic' | 'intermediate' | 'advanced'
    tags?: string[]
  }
  execution: {
    runId: string
    runFingerprint?: string
    status: 'running' | 'passed' | 'failed'
    startedAt: number
    endedAt?: number
    durationMs?: number
    logStats?: TroubleshootingRunLogStats
    logLinesStored: number
  }
  summary?: string
  fingerprints?: {
    case?: string
    run?: string
  }
  result?: {
    success?: boolean
    summary?: string
    params?: Record<string, any>
    messages?: string[]
    errors?: string[]
    checks?: TroubleshootingCaseChecks
  }
  expectations?: {
    checks?: TroubleshootingCaseChecks
    artifacts?: TroubleshootingCaseArtifactSpec[]
    passMessages?: string[]
    errorMessages?: string[]
  }
  signals?: {
    firstError?: string
    lastError?: string
    errorCount: number
    warnCount: number
    errorLogTail: Array<{ ts: number; line: string }>
    warnLogTail: Array<{ ts: number; line: string }>
    timelineTail: Array<{ ts: number; level: 'info' | 'warn' | 'error'; line: string }>
  }
  artifacts?: TroubleshootingArtifactManifestEntry[]
  environment?: {
    nodeVersion?: string
    platform?: string
    arch?: string
    runtimeFlavor?: string
  }
}

export type TroubleshootingLogLevel = 'info' | 'warn' | 'error'

export type TroubleshootingCaseLogger = (line: string, meta?: { level?: TroubleshootingLogLevel }) => void

export interface TroubleshootingCaseRuntimeOptions {
  accountId?: string
  videoLocalPath?: string
  videoPlatformId?: string
  videoCampaignId?: string
  sourceName?: string
  sourceType?: 'channel' | 'keyword' | string
  sourceCampaignId?: string
  randomSeed?: string | number
  [key: string]: any
}

export interface TroubleshootingCaseRunOptions {
  logger?: TroubleshootingCaseLogger
  runtime?: TroubleshootingCaseRuntimeOptions
}

export interface TroubleshootingRunResultLike {
  success: boolean
  summary: string
  accountUsername?: string
  videoPath?: string
  result?: any
  artifacts?: any
  params?: Record<string, any>
  messages?: string[]
  errors?: string[]
  checks?: TroubleshootingCaseChecks
}

export interface TroubleshootingVideoCandidate {
  id: string
  workflowId?: string
  workflowVersion?: string
  campaignId: string
  campaignName?: string
  platformId: string
  status?: string
  localPath: string
  description?: string
  author?: string
  thumbnail?: string
  createdAt?: number
  campaignUpdatedAt?: number
}

export interface TroubleshootingSourceCandidate {
  id: string
  workflowId?: string
  workflowVersion?: string
  campaignId: string
  campaignName?: string
  sourceType: 'channel' | 'keyword' | string
  sourceName: string
  historyLimit?: number
  sortOrder?: string
  timeRange?: string
  minLikes?: number
  minViews?: number
  maxViews?: number
  withinDays?: number
  campaignUpdatedAt?: number
}

export interface WorkflowTroubleshootingProvider {
  workflowId: string
  workflowVersion: string
  cases: TroubleshootingCaseDefinition[]
  runCase?: (
    caseId: TroubleshootingCaseId,
    options?: TroubleshootingCaseRunOptions
  ) => Promise<TroubleshootingRunResultLike | null>
}

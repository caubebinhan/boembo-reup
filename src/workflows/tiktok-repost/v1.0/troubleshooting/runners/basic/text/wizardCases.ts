import path from 'node:path'
import type { TroubleshootingCaseRunOptions, TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'
import { log, safeRead, lineOf, ok, fail, ROOT, FILE_PATHS } from '../../_base'

const STEP2_SOURCES_FILE = FILE_PATHS.STEP2_SOURCES
const WIZARD_FILE = FILE_PATHS.WIZARD
const SCANNER_NODE_FILE = FILE_PATHS.SCANNER_NODE
const DEBUG_DASHBOARD_FILE = FILE_PATHS.DEBUG_DASHBOARD
const DEBUG_STATE_FILE = FILE_PATHS.DEBUG_STATE
export async function runWizardSourcesMainValidationCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const step2 = safeRead(STEP2_SOURCES_FILE)
  const wizard = safeRead(WIZARD_FILE)

  const requiredStep2Controls = [
    'Min Likes',
    'Min Views',
    'Max Views',
    'Within Days',
    'custom_range',
    'historyLimit',
    'sortOrder',
    'timeRange',
  ]
  const requiredWizardValidationClauses = [
    'Add at least one source (channel or keyword)',
    'All sources must have a name',
  ]

  const missingControls = requiredStep2Controls.filter((token) => !step2.includes(token))
  const missingValidation = requiredWizardValidationClauses.filter((token) => !wizard.includes(token))

  log(logger, `[WizardMainValidation] Step2 file: ${STEP2_SOURCES_FILE}`)
  log(logger, `[WizardMainValidation] Workflow wizard file: ${WIZARD_FILE}`)
  log(logger, `[WizardMainValidation] Found ${requiredStep2Controls.length - missingControls.length}/${requiredStep2Controls.length} filter/source control markers`)
  log(logger, `[WizardMainValidation] Found ${requiredWizardValidationClauses.length - missingValidation.length}/${requiredWizardValidationClauses.length} source-step validation clauses`)

  const result = {
    files: {
      step2Sources: STEP2_SOURCES_FILE,
      workflowWizard: WIZARD_FILE,
    },
    checks: {
      requiredStep2Controls,
      requiredWizardValidationClauses,
      missingControls,
      missingValidation,
      lineHints: {
        minLikes: lineOf(step2, 'Min Likes'),
        minViews: lineOf(step2, 'Min Views'),
        maxViews: lineOf(step2, 'Max Views'),
        withinDays: lineOf(step2, 'Within Days'),
        sourceStepValidate: lineOf(wizard, "id: 'sources'"),
      },
    },
  }

  if (missingControls.length || missingValidation.length) {
    return fail('Wizard source step main contract is missing required controls/validation clauses', {
      errors: [
        ...(missingControls.length ? [`Missing Step2 controls: ${missingControls.join(', ')}`] : []),
        ...(missingValidation.length ? [`Missing wizard validation clauses: ${missingValidation.join(', ')}`] : []),
      ],
      artifacts: {
        step2SourceFile: STEP2_SOURCES_FILE,
        wizardSourceFile: WIZARD_FILE,
      },
      result,
      messages: ['Static analysis checks basic source-step UI/validation contract'],
    })
  }

  return ok('Wizard source step main validation contract looks present (controls + basic validate rules found)', {
    messages: [
      'Found filter controls: Min Likes / Min Views / Max Views / Within Days',
      'Found source step validation: non-empty sources + non-empty source names',
    ],
    artifacts: {
      step2SourceFile: STEP2_SOURCES_FILE,
      wizardSourceFile: WIZARD_FILE,
    },
    result,
  })
}

export async function runDebugPanelWorkflowFilterSmokeCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const dashboard = safeRead(DEBUG_DASHBOARD_FILE)
  const state = safeRead(DEBUG_STATE_FILE)

  const checks = {
    hasWorkflowState: state.includes("const [workflowFilter, setWorkflowFilter] = useState<string>('all')"),
    hasVersionState: state.includes("const [versionFilter, setVersionFilter] = useState<string>('all')"),
    hasWorkflowDropdown: dashboard.includes('<option value="all">All Workflows</option>'),
    hasGroupedCases: state.includes('groupCasesBySuiteAndGroup(filteredCases)'),
    hasRunAllButton: dashboard.includes('Run All'),
    hasRunAllSummary: state.includes('Troubleshooting completed: passed'),
  }

  Object.entries(checks).forEach(([key, okFlag]) => {
    log(logger, `[DebugPanelFilterSmoke] ${key}=${okFlag}`)
  })

  const missing = Object.entries(checks).filter(([, okFlag]) => !okFlag).map(([key]) => key)
  const result = {
    checks,
    files: {
      dashboard: DEBUG_DASHBOARD_FILE,
      state: DEBUG_STATE_FILE,
    },
    lineHints: {
      workflowFilterState: lineOf(state, "const [workflowFilter, setWorkflowFilter] = useState<string>('all')"),
      versionFilterState: lineOf(state, "const [versionFilter, setVersionFilter] = useState<string>('all')"),
      workflowDropdown: lineOf(dashboard, '<option value="all">All Workflows</option>'),
    },
  }

  if (missing.length > 0) {
    return fail('Debug panel workflow/version filter contract is incomplete', {
      errors: [`Missing UI contract markers: ${missing.join(', ')}`],
      artifacts: {
        dashboardFile: DEBUG_DASHBOARD_FILE,
        stateFile: DEBUG_STATE_FILE,
      },
      result,
    })
  }

  return ok('Debug panel workflow/version filter contract looks healthy', {
    messages: [
      'Workflow + version filters exist with all/default option handling',
      'Grouped cases + run-all summary are wired in debug state',
    ],
    artifacts: {
      dashboardFile: DEBUG_DASHBOARD_FILE,
      stateFile: DEBUG_STATE_FILE,
    },
    result,
  })
}

export async function runWizardSourcesEdgeGapCase(
  options?: TroubleshootingCaseRunOptions
): Promise<TroubleshootingRunResultLike> {
  const logger = options?.logger
  const step2 = safeRead(STEP2_SOURCES_FILE)
  const wizard = safeRead(WIZARD_FILE)
  const scannerNode = safeRead(SCANNER_NODE_FILE)

  const gaps: Array<{ id: string; message: string; file: string; line?: number | null }> = []

  const hasCustomRangeValidation = /custom_range|startDate|endDate/.test(wizard)
  if (!hasCustomRangeValidation) {
    gaps.push({
      id: 'custom-range-date-validation-missing',
      message: 'Wizard source-step validate() does not enforce startDate/endDate when timeRange=custom_range',
      file: WIZARD_FILE,
      line: lineOf(wizard, "id: 'sources'"),
    })
  }

  const hasMinMaxCrossValidation = /minViews|maxViews/.test(wizard) && /<=|>=/.test(wizard)
  if (!hasMinMaxCrossValidation) {
    gaps.push({
      id: 'min-max-views-cross-validation-missing',
      message: 'Wizard source-step validate() does not check minViews <= maxViews',
      file: WIZARD_FILE,
      line: lineOf(wizard, "id: 'sources'"),
    })
  }

  if (step2.includes('historyLimit: Number(e.target.value)') && scannerNode.includes('source.historyLimit ?? 50')) {
    gaps.push({
      id: 'history-limit-empty-string-zero-coercion',
      message: 'Step2 historyLimit uses Number(e.target.value); empty string becomes 0 and scanner backend ?? fallback will not restore default 50',
      file: STEP2_SOURCES_FILE,
      line: lineOf(step2, 'historyLimit: Number(e.target.value)'),
    })
  }

  if (step2.includes('Number(e.target.value) || undefined')) {
    gaps.push({
      id: 'filter-numeric-silent-coercion',
      message: 'Filter inputs coerce invalid numeric text and 0 to undefined via Number(...) || undefined (may hide user input mistakes)',
      file: STEP2_SOURCES_FILE,
      line: lineOf(step2, 'Number(e.target.value) || undefined'),
    })
  }

  if (step2.includes('label className="text-xs text-gray-500">Within Days</label>') && !wizard.includes('withinDays')) {
    gaps.push({
      id: 'within-days-runtime-validation-missing',
      message: 'Within Days has UI min attr but no wizard/runtime validation in source-step validate()',
      file: WIZARD_FILE,
      line: lineOf(wizard, "id: 'sources'"),
    })
  }

  if (gaps.length === 0) {
    log(logger, '[WizardEdgeGaps] No edge validation gaps detected by current heuristic checks')
    return ok('No wizard/filter edge validation gaps detected by heuristic checks', {
      messages: ['Heuristic checks did not detect missing custom-range/min-max/historyLimit validation issues'],
      artifacts: {
        step2SourceFile: STEP2_SOURCES_FILE,
        wizardSourceFile: WIZARD_FILE,
        scannerNodeFile: SCANNER_NODE_FILE,
      },
      result: { gaps: [] },
    })
  }

  for (const gap of gaps) {
    log(logger, `[WizardEdgeGaps] ${gap.id}: ${gap.message} (${path.relative(ROOT, gap.file)}${gap.line ? `:${gap.line}` : ''})`, 'warn')
  }

  return fail(`Detected ${gaps.length} wizard/scanner edge validation gap(s)`, {
    errors: gaps.map(g => `${g.id}: ${g.message}`),
    messages: [
      'This is an expected failing diagnostic case until wizard/scanner validation hardening is implemented.',
    ],
    artifacts: {
      step2SourceFile: STEP2_SOURCES_FILE,
      wizardSourceFile: WIZARD_FILE,
      scannerNodeFile: SCANNER_NODE_FILE,
    },
    result: { gaps },
  })
}





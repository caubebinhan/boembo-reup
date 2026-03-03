import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DEBUG_DIR = path.join(ROOT, 'tests', 'debug')
const INDEX_JSON = path.join(DEBUG_DIR, 'CASE_INDEX.json')
const CASEBOOK_MD = path.join(DEBUG_DIR, 'CASEBOOK.md')
const WORKFLOW_INDEX_ROOT = path.join(DEBUG_DIR, 'workflows')
const WORKFLOW_INDEX_JSON = path.join(DEBUG_DIR, 'WORKFLOW_INDEX.json')

const WORKFLOW_FINGERPRINT_ALIAS = {
  main: 'MAIN',
  'tiktok-repost': 'TIKTOK',
  'upload-local': 'UPLOAD',
}

function toPathSlug(value) {
  const text = String(value || '').trim().replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
  return text || 'unknown'
}

function listFiles(dir, filterFn, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      listFiles(full, filterFn, out)
    } else if (filterFn(full)) {
      out.push(full)
    }
  }
  return out
}

function findMatchingBrace(text, startIndex) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') {
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }

  return -1
}

function extractObjectBlockFromId(text, idMatchIndex) {
  let cursor = text.lastIndexOf('{', idMatchIndex)
  while (cursor >= 0) {
    const end = findMatchingBrace(text, cursor)
    if (end >= idMatchIndex) {
      return text.slice(cursor, end + 1)
    }
    cursor = text.lastIndexOf('{', cursor - 1)
  }
  return null
}

function pickString(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*'([^']+)'`))
  return match ? match[1] : undefined
}

function pickBool(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*(true|false)`))
  return match ? match[1] === 'true' : undefined
}

function parseNamedObjectLiterals(text) {
  const out = new Map()
  const pattern = /const\s+([A-Za-z0-9_]+)\s*=\s*{/g
  let match

  while ((match = pattern.exec(text))) {
    const name = match[1]
    const braceStart = text.indexOf('{', match.index)
    if (braceStart < 0) continue
    const braceEnd = findMatchingBrace(text, braceStart)
    if (braceEnd < 0) continue
    const block = text.slice(braceStart, braceEnd + 1)
    out.set(name, {
      category: pickString(block, 'category'),
      group: pickString(block, 'group'),
      risk: pickString(block, 'risk'),
      level: pickString(block, 'level'),
      errorCode: pickString(block, 'errorCode'),
      implemented: pickBool(block, 'implemented'),
    })
  }

  return out
}

function parseSpreadDefaults(block, namedObjects) {
  const out = {}
  const spreadPattern = /\.\.\.([A-Za-z0-9_]+)/g
  let spreadMatch

  while ((spreadMatch = spreadPattern.exec(block))) {
    const name = spreadMatch[1]
    const named = namedObjects.get(name)
    if (!named) continue
    Object.assign(out, named)
  }

  return out
}

function parseCasesFromFile(filePath, defaults = {}) {
  const text = fs.readFileSync(filePath, 'utf8')
  const idPattern = /id:\s*'([^']+)'/g
  const namedObjects = parseNamedObjectLiterals(text)
  const seen = new Set()
  const out = []

  let match
  while ((match = idPattern.exec(text))) {
    const rawId = match[1]
    const id = rawId
    if (seen.has(id)) continue

    const block = extractObjectBlockFromId(text, match.index)
    if (!block) continue

    const spreadDefaults = parseSpreadDefaults(block, namedObjects)
    const title = pickString(block, 'title')
    const description = pickString(block, 'description')
    if (!title || !description) continue

    const category = pickString(block, 'category') || spreadDefaults.category || defaults.category || 'general'
    const group = pickString(block, 'group') || spreadDefaults.group || category
    const risk = pickString(block, 'risk') || spreadDefaults.risk || defaults.risk || 'safe'
    const level = pickString(block, 'level') || spreadDefaults.level || defaults.level || 'basic'
    const errorCode = pickString(block, 'errorCode') || spreadDefaults.errorCode
    const implemented = pickBool(block, 'implemented')
    const spreadImplemented = typeof spreadDefaults.implemented === 'boolean'
      ? spreadDefaults.implemented
      : undefined

    out.push({
      id,
      title,
      description,
      category,
      group,
      risk,
      level,
      errorCode,
      implemented: implemented === undefined
        ? (spreadImplemented === undefined ? !!defaults.implemented : spreadImplemented)
        : implemented,
      sourceFile: path.relative(ROOT, filePath).replaceAll('\\', '/'),
      workflowId: defaults.workflowId,
      workflowVersion: defaults.workflowVersion,
      suite: defaults.suite || 'debug',
    })
    seen.add(id)
  }

  return out
}

function parseWorkflowCases() {
  const workflowRoot = path.join(ROOT, 'src', 'workflows')
  const files = listFiles(
    workflowRoot,
    (fullPath) =>
      fullPath.endsWith('.ts') &&
      fullPath.includes(`${path.sep}troubleshooting${path.sep}cases${path.sep}`)
  )

  const entries = []
  for (const file of files) {
    const rel = path.relative(workflowRoot, file).replaceAll('\\', '/')
    const match = rel.match(/^([^/]+)\/(v[^/]+)\//)
    const workflowId = match?.[1]
    const workflowVersion = match?.[2]?.replace(/^v/, '')
    const fileBase = path.basename(file, '.ts')
    const defaults = {
      workflowId,
      workflowVersion,
      suite: 'debug',
      ...(fileBase === 'network'
        ? {
          category: 'network',
          group: 'network',
          implemented: true,
          level: 'advanced',
        }
        : {}),
    }
    entries.push(...parseCasesFromFile(file, defaults))
  }
  return entries
}

function parseSyntheticCases() {
  const file = path.join(ROOT, 'src', 'main', 'services', 'troubleshooting', 'cases', 'nonWorkflowCases.ts')
  return parseCasesFromFile(file, {
    workflowId: 'main',
    workflowVersion: '1.0',
    risk: 'safe',
    implemented: false,
    suite: 'external',
  })
}

function toWorkflowCode(workflowId) {
  const raw = String(workflowId || 'unscoped').trim().toLowerCase()
  if (WORKFLOW_FINGERPRINT_ALIAS[raw]) return WORKFLOW_FINGERPRINT_ALIAS[raw]

  const compact = raw
    .replaceAll(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .map(chunk => chunk.slice(0, 4))
    .join('')
    .toUpperCase()

  return compact || 'CASE'
}

function compareFingerprintOrder(left, right) {
  const leftWorkflow = left.workflowId || 'unscoped'
  const rightWorkflow = right.workflowId || 'unscoped'
  if (leftWorkflow !== rightWorkflow) return leftWorkflow.localeCompare(rightWorkflow)

  const leftVersion = left.workflowVersion || 'unversioned'
  const rightVersion = right.workflowVersion || 'unversioned'
  if (leftVersion !== rightVersion) {
    return leftVersion.localeCompare(rightVersion, undefined, { numeric: true })
  }

  return left.id.localeCompare(right.id)
}

function assignReadableFingerprints(entries) {
  const counters = new Map()
  const byId = new Map()
  const sorted = [...entries].sort(compareFingerprintOrder)

  for (const entry of sorted) {
    const workflowCode = toWorkflowCode(entry.workflowId)
    const next = (counters.get(workflowCode) || 0) + 1
    counters.set(workflowCode, next)
    byId.set(entry.id, `case-${workflowCode}-${String(next).padStart(2, '0')}`)
  }

  return entries.map(entry => ({
    ...entry,
    fingerprint: byId.get(entry.id) || entry.fingerprint,
  }))
}

function withStatus(entries) {
  return entries.map(entry => ({
    ...entry,
    status: entry.implemented ? 'runnable' : 'planned',
  }))
}

function plannedTodos(_entry) {
  return [
    'Implement runner branch and wire caseId dispatch.',
    'Add deterministic fixture/setup for reproducible debug reruns.',
    'Assert DB/UI/log/event checks from case meta.',
    'Attach artifact outputs + diagnostic footprint for investigation.',
    'Flip implemented=true after validation in Debug tab.',
  ]
}

function sortById(entries) {
  return [...entries].sort((a, b) => a.id.localeCompare(b.id))
}

function scopeKey(entry) {
  const workflowId = entry.workflowId || 'unscoped'
  const workflowVersion = entry.workflowVersion || 'unversioned'
  return `${workflowId}@${workflowVersion}`
}

function toVersionFolder(workflowVersion) {
  const raw = String(workflowVersion || 'unversioned')
  return raw.startsWith('v') ? raw : `v${raw}`
}

function toRelativePath(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function toImplementedCasePayload(entry) {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    group: entry.group,
    risk: entry.risk,
    level: entry.level,
    errorCode: entry.errorCode,
    implemented: true,
    sourceFile: entry.sourceFile,
    workflowId: entry.workflowId,
    workflowVersion: entry.workflowVersion,
    suite: entry.suite,
    fingerprint: entry.fingerprint,
    status: 'runnable',
  }
}

function buildGroupTodoMarkdown(workflowId, workflowVersion, group, plannedEntries) {
  const lines = []
  lines.push(`# TODO Cases: ${workflowId}@${workflowVersion} / ${group}`)
  lines.push('')
  lines.push(`- Total TODO: **${plannedEntries.length}**`)
  lines.push(`- Generated at: ${new Date().toISOString()}`)
  lines.push('')

  for (const entry of plannedEntries) {
    lines.push(`## ${entry.id}`)
    lines.push(`- Title: ${entry.title}`)
    lines.push(`- Code: \`${entry.fingerprint}\``)
    lines.push(`- Category: ${entry.category} | Group: ${entry.group} | Level: ${entry.level}`)
    lines.push(`- Source: \`${entry.sourceFile}\``)
    for (const todo of plannedTodos(entry)) lines.push(`- TODO: ${todo}`)
    lines.push('')
  }

  return lines.join('\n')
}

function buildWorkflowCasebook(workflowId, workflowVersion, implementedEntries, plannedEntries, groupRows) {
  const lines = []
  lines.push(`# Debug Casebook: ${workflowId}@${workflowVersion}`)
  lines.push('')
  lines.push(`- Implemented cases (JSON): **${implementedEntries.length}**`)
  lines.push(`- TODO cases (Markdown): **${plannedEntries.length}**`)
  lines.push(`- Generated at: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Group Breakdown')
  lines.push('')
  lines.push('| Group | Implemented | TODO |')
  lines.push('|---|---:|---:|')
  for (const row of groupRows) {
    lines.push(`| ${row.group} | ${row.implemented} | ${row.todo} |`)
  }
  lines.push('')
  lines.push('## TODO Queue')
  lines.push('')
  if (plannedEntries.length === 0) {
    lines.push('- No TODO cases in this workflow scope.')
    lines.push('')
  } else {
    for (const entry of plannedEntries) {
      lines.push(`### ${entry.id}`)
      lines.push(`- Title: ${entry.title}`)
      lines.push(`- Group: ${entry.group} | Category: ${entry.category} | Level: ${entry.level}`)
      lines.push(`- Code: \`${entry.fingerprint}\``)
      lines.push(`- Source: \`${entry.sourceFile}\``)
      for (const todo of plannedTodos(entry)) lines.push(`- TODO: ${todo}`)
      lines.push('')
    }
  }
  lines.push('## Implemented JSON Layout')
  lines.push('')
  lines.push('- Implemented cases are split by group and written as one JSON file per case.')
  lines.push('- Path pattern: `groups/<group>/cases/<case-id>.json`')
  lines.push('')
  return lines.join('\n')
}

function buildRootCasebook(entries, workflowRows) {
  const implemented = entries.filter(e => e.implemented)
  const planned = entries.filter(e => !e.implemented)
  const lines = []
  lines.push('# Debug Casebook')
  lines.push('')
  lines.push('Central backlog/index for troubleshooting/debug scenarios.')
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Total implemented cases (JSON): **${implemented.length}**`)
  lines.push(`- Total TODO cases (Markdown): **${planned.length}**`)
  lines.push(`- Generated at: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Workflow Breakdown')
  lines.push('')
  lines.push('| Scope | Implemented | TODO |')
  lines.push('|---|---:|---:|')
  for (const row of workflowRows) {
    lines.push(`| ${row.scope} | ${row.runnable} | ${row.planned} |`)
  }
  lines.push('')
  lines.push('## TODO Queue')
  lines.push('')

  if (planned.length === 0) {
    lines.push('- No TODO cases.')
    lines.push('')
    return lines.join('\n')
  }

  const sortedPlanned = [...planned].sort((a, b) => {
    const scopeCompare = scopeKey(a).localeCompare(scopeKey(b))
    if (scopeCompare !== 0) return scopeCompare
    const groupCompare = (a.group || '').localeCompare(b.group || '')
    if (groupCompare !== 0) return groupCompare
    return a.id.localeCompare(b.id)
  })

  for (const entry of sortedPlanned) {
    lines.push(`### ${entry.id}`)
    lines.push(`- Title: ${entry.title}`)
    lines.push(`- Scope: ${(entry.workflowId || 'unscoped')}@${entry.workflowVersion || 'unversioned'}`)
    lines.push(`- Group: ${entry.group} | Category: ${entry.category} | Level: ${entry.level}`)
    lines.push(`- Code: \`${entry.fingerprint}\``)
    lines.push(`- Source: \`${entry.sourceFile}\``)
    for (const todo of plannedTodos(entry)) lines.push(`- TODO: ${todo}`)
    lines.push('')
  }

  return lines.join('\n')
}

function writeWorkflowIndexes(entries, generatedAt) {
  fs.rmSync(WORKFLOW_INDEX_ROOT, { recursive: true, force: true })
  fs.mkdirSync(WORKFLOW_INDEX_ROOT, { recursive: true })

  const byScope = new Map()
  for (const entry of entries) {
    const key = scopeKey(entry)
    if (!byScope.has(key)) byScope.set(key, [])
    byScope.get(key).push(entry)
  }

  const workflowRows = []

  for (const [scope, scopeEntriesRaw] of [...byScope.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const scopeEntries = sortById(scopeEntriesRaw)
    const first = scopeEntries[0] || {}
    const workflowId = first.workflowId || 'unscoped'
    const workflowVersion = first.workflowVersion || 'unversioned'
    const workflowDir = path.join(
      WORKFLOW_INDEX_ROOT,
      toPathSlug(workflowId),
      toPathSlug(toVersionFolder(workflowVersion))
    )
    fs.mkdirSync(workflowDir, { recursive: true })

    const implementedEntries = scopeEntries.filter(entry => entry.implemented)
    const plannedEntries = scopeEntries.filter(entry => !entry.implemented)
    const groupBuckets = new Map()
    for (const entry of scopeEntries) {
      const group = entry.group || entry.category || 'general'
      if (!groupBuckets.has(group)) groupBuckets.set(group, { implemented: [], planned: [] })
      if (entry.implemented) groupBuckets.get(group).implemented.push(entry)
      else groupBuckets.get(group).planned.push(entry)
    }

    const groupRows = []
    for (const [group, bucket] of [...groupBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const groupDir = path.join(workflowDir, 'groups', toPathSlug(group))
      const casesDir = path.join(groupDir, 'cases')
      fs.mkdirSync(casesDir, { recursive: true })

      const caseRows = []
      for (const entry of sortById(bucket.implemented)) {
        const caseFile = path.join(casesDir, `${toPathSlug(entry.id)}.json`)
        writeJson(caseFile, {
          schemaVersion: 2,
          generatedAt,
          workflowId,
          workflowVersion,
          group,
          case: toImplementedCasePayload(entry),
        })

        caseRows.push({
          id: entry.id,
          title: entry.title,
          fingerprint: entry.fingerprint,
          errorCode: entry.errorCode,
          category: entry.category,
          group: entry.group,
          level: entry.level,
          risk: entry.risk,
          caseFilePath: toRelativePath(caseFile),
        })
      }

      const groupIndexPath = path.join(groupDir, 'CASE_INDEX.json')
      writeJson(groupIndexPath, {
        schemaVersion: 2,
        generatedAt,
        workflowId,
        workflowVersion,
        group,
        totalImplemented: caseRows.length,
        cases: caseRows,
      })

      let todoPath = null
      if (bucket.planned.length > 0) {
        todoPath = path.join(groupDir, 'TODO.md')
        fs.writeFileSync(
          todoPath,
          `${buildGroupTodoMarkdown(workflowId, workflowVersion, group, sortById(bucket.planned))}\n`,
          'utf8'
        )
      }

      groupRows.push({
        group,
        implemented: bucket.implemented.length,
        todo: bucket.planned.length,
        caseIndexPath: toRelativePath(groupIndexPath),
        todoPath: todoPath ? toRelativePath(todoPath) : null,
        casesDirPath: toRelativePath(casesDir),
      })
    }

    const workflowIndexPath = path.join(workflowDir, 'CASE_INDEX.json')
    const workflowCasebookPath = path.join(workflowDir, 'CASEBOOK.md')

    writeJson(workflowIndexPath, {
      schemaVersion: 2,
      generatedAt,
      workflowId,
      workflowVersion,
      totalImplemented: implementedEntries.length,
      totalTodo: plannedEntries.length,
      groups: groupRows,
    })

    fs.writeFileSync(
      workflowCasebookPath,
      `${buildWorkflowCasebook(workflowId, workflowVersion, implementedEntries, plannedEntries, groupRows)}\n`,
      'utf8'
    )

    workflowRows.push({
      workflowId,
      workflowVersion,
      scope,
      total: implementedEntries.length,
      runnable: implementedEntries.length,
      planned: plannedEntries.length,
      caseIndexPath: toRelativePath(workflowIndexPath),
      casebookPath: toRelativePath(workflowCasebookPath),
    })
  }

  writeJson(WORKFLOW_INDEX_JSON, {
    schemaVersion: 2,
    generatedAt,
    totalWorkflows: workflowRows.length,
    workflows: workflowRows,
  })

  return workflowRows
}

function main() {
  const workflowCases = parseWorkflowCases()
  const syntheticCases = parseSyntheticCases()
  const byId = new Map()

  for (const entry of [...workflowCases, ...syntheticCases]) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  }

  const entries = withStatus(assignReadableFingerprints([...byId.values()]))
  const sortedEntries = sortById(entries)
  const implementedEntries = sortedEntries.filter(entry => entry.implemented)
  const plannedEntries = sortedEntries.filter(entry => !entry.implemented)
  const generatedAt = Date.now()

  fs.mkdirSync(DEBUG_DIR, { recursive: true })

  const workflowRows = writeWorkflowIndexes(sortedEntries, generatedAt)

  writeJson(INDEX_JSON, {
    schemaVersion: 2,
    generatedAt,
    totalImplemented: implementedEntries.length,
    totalTodo: plannedEntries.length,
    totalWorkflows: workflowRows.length,
    workflows: workflowRows.map((row) => ({
      workflowId: row.workflowId,
      workflowVersion: row.workflowVersion,
      scope: row.scope,
      totalImplemented: row.runnable,
      totalTodo: row.planned,
      caseIndexPath: row.caseIndexPath,
      casebookPath: row.casebookPath,
    })),
  })

  fs.writeFileSync(CASEBOOK_MD, `${buildRootCasebook(sortedEntries, workflowRows)}\n`, 'utf8')

  console.log(`[debug-casebook] Wrote summary index to ${path.relative(ROOT, INDEX_JSON)}`)
  console.log(`[debug-casebook] Wrote root TODO casebook to ${path.relative(ROOT, CASEBOOK_MD)}`)
  console.log(`[debug-casebook] Wrote ${workflowRows.length} workflow trees under ${path.relative(ROOT, WORKFLOW_INDEX_ROOT)}`)
  console.log(`[debug-casebook] Wrote workflow index map to ${path.relative(ROOT, WORKFLOW_INDEX_JSON)}`)
}

main()

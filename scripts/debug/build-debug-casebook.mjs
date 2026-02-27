import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DEBUG_DIR = path.join(ROOT, 'tests', 'debug')
const INDEX_JSON = path.join(DEBUG_DIR, 'CASE_INDEX.json')
const CASEBOOK_MD = path.join(DEBUG_DIR, 'CASEBOOK.md')

function sha1(value) {
  return createHash('sha1').update(value).digest('hex')
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

function parseCasesFromFile(filePath, defaults = {}) {
  const text = fs.readFileSync(filePath, 'utf8')
  const idPattern = /id:\s*'([^']+)'/g
  const seen = new Set()
  const out = []

  let match
  while ((match = idPattern.exec(text))) {
    const id = match[1]
    if (seen.has(id)) continue
    const block = extractObjectBlockFromId(text, match.index)
    if (!block) continue
    const title = pickString(block, 'title')
    const description = pickString(block, 'description')
    if (!title || !description) continue

    const category = pickString(block, 'category') || defaults.category || 'general'
    const group = pickString(block, 'group') || category
    const risk = pickString(block, 'risk') || defaults.risk || 'safe'
    const level = pickString(block, 'level') || defaults.level || 'basic'
    const implemented = pickBool(block, 'implemented')

    out.push({
      id,
      title,
      description,
      category,
      group,
      risk,
      level,
      implemented: implemented === undefined ? !!defaults.implemented : implemented,
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
    const defaults = {
      workflowId,
      workflowVersion,
      suite: 'debug',
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

function withFingerprint(entry) {
  const seed = [
    entry.workflowId || 'unscoped',
    entry.workflowVersion || 'unversioned',
    entry.id,
    entry.group || entry.category || 'general',
    entry.risk || 'safe',
  ].join('|')
  return {
    ...entry,
    fingerprint: `case-${sha1(seed).slice(0, 16)}`,
  }
}

function withTodos(entry) {
  if (entry.implemented) {
    return {
      ...entry,
      todos: [
        'Keep runner branch stable and keep output summary deterministic.',
        'Keep artifact payload compatible with Debug tab preview.',
        'Keep fingerprint stable unless case identity changes.',
      ],
      status: 'runnable',
    }
  }
  return {
    ...entry,
    todos: [
      'Implement runner branch and wire caseId dispatch.',
      'Add deterministic fixture/setup for reproducible debug reruns.',
      'Assert DB/UI/log/event checks from case meta.',
      'Attach artifact outputs + diagnostic footprint for investigation.',
      'Flip implemented=true after validation in Debug tab.',
    ],
    status: 'planned',
  }
}

function buildCasebook(entries) {
  const total = entries.length
  const runnable = entries.filter(e => e.status === 'runnable').length
  const planned = entries.filter(e => e.status === 'planned').length
  const byWorkflow = new Map()
  for (const entry of entries) {
    const key = `${entry.workflowId || 'unscoped'}@${entry.workflowVersion || 'unversioned'}`
    if (!byWorkflow.has(key)) byWorkflow.set(key, { total: 0, runnable: 0, planned: 0 })
    const bucket = byWorkflow.get(key)
    bucket.total += 1
    if (entry.status === 'runnable') bucket.runnable += 1
    if (entry.status === 'planned') bucket.planned += 1
  }

  const lines = []
  lines.push('# Debug Casebook')
  lines.push('')
  lines.push('Central backlog/index for all troubleshooting/debug scenarios.')
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Total cases: **${total}**`)
  lines.push(`- Runnable: **${runnable}**`)
  lines.push(`- Planned: **${planned}**`)
  lines.push(`- Generated at: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Workflow Breakdown')
  lines.push('')
  lines.push('| Scope | Total | Runnable | Planned |')
  lines.push('|---|---:|---:|---:|')
  for (const [scope, stat] of [...byWorkflow.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${scope} | ${stat.total} | ${stat.runnable} | ${stat.planned} |`)
  }
  lines.push('')
  lines.push('## Implementation Queue')
  lines.push('')
  for (const entry of entries.filter(e => e.status === 'planned')) {
    lines.push(`### ${entry.id}`)
    lines.push(`- Title: ${entry.title}`)
    lines.push(`- Scope: ${(entry.workflowId || 'unscoped')}@${entry.workflowVersion || 'unversioned'}`)
    lines.push(`- Group: ${entry.group} | Category: ${entry.category} | Level: ${entry.level}`)
    lines.push(`- Fingerprint: \`${entry.fingerprint}\``)
    lines.push(`- Source: \`${entry.sourceFile}\``)
    for (const todo of entry.todos) lines.push(`- TODO: ${todo}`)
    lines.push('')
  }
  lines.push('## Runnable Cases')
  lines.push('')
  for (const entry of entries.filter(e => e.status === 'runnable')) {
    lines.push(`- ${entry.id} (\`${entry.fingerprint}\`) -> ${entry.sourceFile}`)
  }
  lines.push('')
  lines.push('## Notes')
  lines.push('')
  lines.push('- Case runtime metadata and artifacts are persisted by `TroubleshootingService` into `tests/debug/artifacts` and `tests/debug/footprints`.')
  lines.push('- Use `npm run debug:casebook` after adding/editing case definitions.')
  lines.push('')
  return lines.join('\n')
}

function main() {
  const workflowCases = parseWorkflowCases()
  const syntheticCases = parseSyntheticCases()
  const byId = new Map()

  for (const entry of [...workflowCases, ...syntheticCases]) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  }

  const entries = [...byId.values()]
    .map(withFingerprint)
    .map(withTodos)
    .sort((a, b) => a.id.localeCompare(b.id))

  fs.mkdirSync(DEBUG_DIR, { recursive: true })
  fs.mkdirSync(path.join(DEBUG_DIR, 'artifacts'), { recursive: true })
  fs.mkdirSync(path.join(DEBUG_DIR, 'footprints'), { recursive: true })
  fs.mkdirSync(path.join(DEBUG_DIR, 'runs'), { recursive: true })

  fs.writeFileSync(INDEX_JSON, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: Date.now(),
    total: entries.length,
    entries,
  }, null, 2)}\n`, 'utf8')

  fs.writeFileSync(CASEBOOK_MD, `${buildCasebook(entries)}\n`, 'utf8')

  console.log(`[debug-casebook] Wrote ${entries.length} cases to ${path.relative(ROOT, INDEX_JSON)}`)
  console.log(`[debug-casebook] Wrote casebook to ${path.relative(ROOT, CASEBOOK_MD)}`)
}

main()

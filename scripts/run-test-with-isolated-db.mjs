import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [, , label = 'test', ...commandParts] = process.argv

if (commandParts.length === 0) {
  console.error('Usage: node scripts/run-test-with-isolated-db.mjs <label> "<command>"')
  process.exit(1)
}

const command = commandParts.join(' ')
const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
const runToken = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const dbPath = resolve(process.cwd(), '.test-db', safeLabel, `${runToken}.db`)

mkdirSync(dirname(dbPath), { recursive: true })
writeFileSync(resolve(process.cwd(), '.test-db', safeLabel, 'LATEST_DB_PATH.txt'), `${dbPath}\n`)

console.log(`[test-db] Using isolated DB for "${safeLabel}": ${dbPath}`)

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    REPOST_IO_DB_PATH: dbPath,
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (err) => {
  console.error('[test-db] Failed to launch command:', err)
  process.exit(1)
})

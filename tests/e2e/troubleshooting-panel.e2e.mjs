import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { _electron as electron } from 'playwright'
import { e2eCaseGroups, e2eCaseIndex } from './cases/index.mjs'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron')
const mainEntry = path.resolve(process.cwd(), 'out', 'main', 'index.js')
const dbLogRoot = path.resolve(process.cwd(), '.test-db', 'e2e-cases')
const latestDbFile = path.resolve(dbLogRoot, 'LATEST_DB_PATHS.txt')

const onlyCaseId = process.env.TEST_CASE_ID?.trim()

if (onlyCaseId && !e2eCaseIndex.has(onlyCaseId)) {
  test(`[missing-case] ${onlyCaseId}`, () => {
    assert.fail(`Unknown TEST_CASE_ID: ${onlyCaseId}`)
  })
}

function toSafeSlug(value) {
  return String(value || 'case').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function createDbPathForCase(caseId) {
  const runToken = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 9)}`
  return path.resolve(dbLogRoot, `${toSafeSlug(caseId)}-${runToken}.db`)
}

function appendLatestDbLog(caseId, dbPath) {
  mkdirSync(dbLogRoot, { recursive: true })
  writeFileSync(latestDbFile, `[${new Date().toISOString()}] ${caseId} => ${dbPath}\n`, {
    encoding: 'utf8',
    flag: 'a',
  })
}

async function openTroubleshootingTab(page) {
  const debugButton = page.getByRole('button', { name: /debug/i })
  await debugButton.waitFor({ state: 'visible', timeout: 120_000 })
  await debugButton.click()
  await page.getByText('Test Cases').waitFor({ state: 'visible', timeout: 60_000 })
}

async function launchAppForCase(caseId) {
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing Electron build output: ${mainEntry}. Run "electron-vite build" first.`)
  }

  const dbPath = createDbPathForCase(caseId)
  appendLatestDbLog(caseId, dbPath)
  console.log(`[test-db] [${caseId}] Using isolated DB: ${dbPath}`)

  const requestedHeadless = process.env.E2E_HEADLESS?.trim()
  const launchEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    REPOST_IO_DB_PATH: dbPath,
    E2E_HEADLESS: requestedHeadless || '1',
  }
  // npm/node test may export this flag, which forces electron.exe to run as plain node.
  delete launchEnv.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [mainEntry],
    timeout: 120_000,
    env: launchEnv,
  })

  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1600, height: 980 })
  await openTroubleshootingTab(page)
  return { app, page, dbPath }
}

for (const group of e2eCaseGroups) {
  for (const caseDef of group.cases) {
    const register = onlyCaseId && onlyCaseId !== caseDef.id ? test.skip : test
    register(`[${group.id}] [${caseDef.id}] ${caseDef.title}`, async () => {
      const { app, page } = await launchAppForCase(caseDef.id)
      try {
        await caseDef.run({ page, assert })
      } finally {
        await app.close()
      }
    })
  }
}

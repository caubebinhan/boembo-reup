import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright'
import { e2eCaseGroups, e2eCaseIndex } from './cases/index.mjs'
import {
  TROUBLESHOOTING_PANEL_FIXTURE_ACCOUNTS,
  TROUBLESHOOTING_PANEL_FIXTURE_CASES,
  TROUBLESHOOTING_PANEL_FIXTURE_SOURCE_CANDIDATES,
  TROUBLESHOOTING_PANEL_FIXTURE_VIDEO_CANDIDATES,
  TROUBLESHOOTING_PANEL_FIXTURE_WORKFLOWS,
  TROUBLESHOOTING_PANEL_FIXTURE_RUNS,
} from './cases/troubleshooting/fixtures.mjs'

let browser
let page
let server
let baseUrl

const onlyCaseId = process.env.TEST_CASE_ID?.trim()
const rawHeadless = String(process.env.E2E_HEADLESS ?? '1').toLowerCase()
const headless = !['0', 'false', 'no', 'off'].includes(rawHeadless)
const runtimeEnv = (() => {
  const platform = process.platform
  const arch = process.arch
  const isWindows = platform === 'win32'
  const isMacAppleSilicon = platform === 'darwin' && arch === 'arm64'
  const isMacIntel = platform === 'darwin' && arch === 'x64'
  const runtimeLabel = isWindows
    ? 'windows'
    : isMacAppleSilicon
      ? 'macos-arm64'
      : isMacIntel
        ? 'macos-x64'
        : `${platform}-${arch}`

  const tempRoot = os.tmpdir()
  return {
    platform,
    arch,
    runtimeLabel,
    dbPath: path.join(tempRoot, `boembo-e2e-${runtimeLabel}.db`),
    storagePath: tempRoot,
  }
})()

if (onlyCaseId && !e2eCaseIndex.has(onlyCaseId)) {
  test(`[missing-case] ${onlyCaseId}`, () => {
    assert.fail(`Unknown TEST_CASE_ID: ${onlyCaseId}`)
  })
}

test.before(async () => {
  const rootDir = path.join(process.cwd(), 'out', 'renderer')
  server = http.createServer((req, res) => {
    const requestPath = (req.url || '/').split('?')[0]
    const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
    const targetPath = path.join(rootDir, normalizedPath)
    const safePath = targetPath.startsWith(rootDir) ? targetPath : path.join(rootDir, 'index.html')

    if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const ext = path.extname(safePath).toLowerCase()
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    }[ext] || 'application/octet-stream'

    res.writeHead(200, { 'Content-Type': contentType })
    fs.createReadStream(safePath).pipe(res)
  })

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address()
  baseUrl = `http://127.0.0.1:${addr.port}`

  browser = await chromium.launch({ headless })
  page = await browser.newPage()

  await page.addInitScript(
    ({ fixtureCases, fixtureRuns, fixtureWorkflows, fixtureAccounts, fixtureVideos, fixtureSources, runtime }) => {
      const listeners = new Map()
      const clone = (value) => JSON.parse(JSON.stringify(value))
      const emit = (channel, payload) => {
        const callbacks = listeners.get(channel)
        if (!callbacks) return
        for (const callback of callbacks) {
          try {
            callback(payload)
          } catch {}
        }
      }
      const state = {
        cases: clone(fixtureCases),
        runs: clone(fixtureRuns),
        workflows: clone(fixtureWorkflows),
        accounts: clone(fixtureAccounts),
        videos: clone(fixtureVideos),
        sources: clone(fixtureSources),
      }

      const api = {
        invoke: async (channel, payload) => {
          if (channel === 'campaign:list') return []
          if (channel === 'settings:db-info') return { dbPath: runtime.dbPath, runtime: { platform: runtime.platform, arch: runtime.arch } }
          if (channel === 'settings:inspect-schema') {
            return { healthy: true, tables: ['campaigns', 'jobs', 'execution_logs'], indexes: [] }
          }
          if (channel === 'healthcheck:storage') return { ok: true, freeMB: 4096, path: runtime.storagePath }
          if (channel === 'healthcheck:services') return { ok: true, services: [] }

          if (channel === 'troubleshooting:list-cases') return clone(state.cases)
          if (channel === 'troubleshooting:list-workflows') return clone(state.workflows)
          if (channel === 'troubleshooting:list-runs') return clone(state.runs)
          if (channel === 'account:list') return clone(state.accounts)

          if (channel === 'troubleshooting:list-video-candidates') {
            const workflowId = payload?.workflowId
            const videos = workflowId
              ? state.videos.filter((item) => item.workflowId === workflowId)
              : state.videos
            return clone(videos)
          }
          if (channel === 'troubleshooting:list-source-candidates') {
            const workflowId = payload?.workflowId
            const sources = workflowId
              ? state.sources.filter((item) => item.workflowId === workflowId)
              : state.sources
            return clone(sources)
          }

          if (channel === 'troubleshooting:run-case') {
            const caseId = payload?.caseId
            const caseDef = state.cases.find((entry) => entry.id === caseId)
            if (!caseDef) throw new Error(`Unknown fixture case: ${caseId}`)
            if (caseDef.implemented === false) throw new Error(`Case not implemented in fixture: ${caseId}`)
            const now = Date.now()
            const run = {
              id: `fixture-run-${now}-${Math.random().toString(36).slice(2, 7)}`,
              caseId,
              title: `${caseDef.title} (Fixture Run)`,
              status: 'passed',
              startedAt: now,
              endedAt: now + 100,
              summary: `Synthetic pass for ${caseDef.id}`,
              workflowId: caseDef.workflowId,
              workflowVersion: caseDef.workflowVersion,
              category: caseDef.category,
              group: caseDef.group,
              tags: caseDef.tags || [],
              level: caseDef.level,
              logs: [{ ts: now, level: 'info', line: `Fixture run executed for ${caseDef.id}` }],
              logStats: { total: 1, info: 1, warn: 0, error: 0 },
              result: {
                success: true,
                runtime: payload?.runtime || {},
              },
            }
            state.runs.unshift(run)
            emit('troubleshooting:run-update', { record: clone(run) })
            return clone(run)
          }

          if (channel === 'troubleshooting:send-run-to-sentry') {
            return {
              success: true,
              eventId: '25e5a8f780d24a58b0d7d6c8a2c10a55',
              sentry: {
                verificationEnabled: true,
                strictRequired: false,
                verified: true,
                message: 'Sentry event verified on staging.',
                eventUrl: 'https://sentry.io/organizations/acme/issues/1/events/25e5a8f780d24a58b0d7d6c8a2c10a55/',
                issueSearchUrl: 'https://sentry.io/organizations/acme/issues/?query=event.id%3A25e5a8f780d24a58b0d7d6c8a2c10a55',
                eventApiUrl: 'https://sentry.io/api/0/projects/acme/staging/events/25e5a8f780d24a58b0d7d6c8a2c10a55/',
                attempts: 2,
                elapsedMs: 540,
              },
            }
          }
          if (channel === 'troubleshooting:clear-runs') {
            state.runs = []
            return { success: true }
          }
          return null
        },
        on: (channel, callback) => {
          if (!listeners.has(channel)) listeners.set(channel, new Set())
          listeners.get(channel).add(callback)
          return () => {
            listeners.get(channel)?.delete(callback)
          }
        },
        removeAllListeners: () => listeners.clear(),
      }
      Object.defineProperty(window, 'api', {
        configurable: true,
        enumerable: true,
        value: api,
      })
    },
    {
      fixtureCases: TROUBLESHOOTING_PANEL_FIXTURE_CASES,
      fixtureRuns: TROUBLESHOOTING_PANEL_FIXTURE_RUNS,
      fixtureWorkflows: TROUBLESHOOTING_PANEL_FIXTURE_WORKFLOWS,
      fixtureAccounts: TROUBLESHOOTING_PANEL_FIXTURE_ACCOUNTS,
      fixtureVideos: TROUBLESHOOTING_PANEL_FIXTURE_VIDEO_CANDIDATES,
      fixtureSources: TROUBLESHOOTING_PANEL_FIXTURE_SOURCE_CANDIDATES,
      runtime: runtimeEnv,
    }
  )

  await page.goto(baseUrl)
  await page.getByRole('button', { name: /debug/i }).click()
  await page.getByText('Test Cases').waitFor()
})

test.after(async () => {
  if (browser) await browser.close()
  if (server) {
    await new Promise(resolve => server.close(() => resolve()))
  }
})

for (const group of e2eCaseGroups) {
  for (const caseDef of group.cases) {
    const register = onlyCaseId && onlyCaseId !== caseDef.id ? test.skip : test
    register(`[${group.id}] [${caseDef.id}] ${caseDef.title}`, async () => {
      await caseDef.run({ page, assert })
    })
  }
}

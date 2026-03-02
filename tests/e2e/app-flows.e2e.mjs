import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron')
const mainEntry = path.resolve(process.cwd(), 'out', 'main', 'index.js')
const dbLogRoot = path.resolve(process.cwd(), '.test-db', 'e2e-app-flows')
const latestDbFile = path.resolve(dbLogRoot, 'LATEST_DB_PATHS.txt')
const onlyCaseId = process.env.TEST_CASE_ID?.trim()

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

async function launchAppForCase(caseId) {
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing Electron build output: ${mainEntry}. Run "electron-vite build" first.`)
  }

  const dbPath = createDbPathForCase(caseId)
  appendLatestDbLog(caseId, dbPath)
  const requestedHeadless = process.env.E2E_HEADLESS?.trim()
  const launchEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    REPOST_IO_DB_PATH: dbPath,
    E2E_HEADLESS: requestedHeadless || '1',
  }
  delete launchEnv.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [mainEntry],
    timeout: 120_000,
    env: launchEnv,
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1600, height: 980 })
  await page.getByRole('button', { name: /new campaign/i }).waitFor({ state: 'visible', timeout: 120_000 })
  return { app, page }
}

async function createCampaign(page, payload) {
  return page.evaluate((body) => window.api.invoke('campaign:create', body), payload)
}

async function enqueuePendingJob(page, payload) {
  return page.evaluate((body) => window.api.invoke('troubleshooting:test:enqueue-job', body), payload)
}

async function getCampaignLogs(page, campaignId, limit = 400) {
  return page.evaluate(({ id, nextLimit }) => window.api.invoke('campaign:get-logs', { id, limit: nextLimit }), {
    id: campaignId,
    nextLimit: limit,
  })
}

async function waitForLogMatch(page, campaignId, matcher, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const logs = await getCampaignLogs(page, campaignId)
    if (matcher(logs)) return logs
    await page.waitForTimeout(500)
  }
  return getCampaignLogs(page, campaignId)
}

function registerCase(caseId, title, fn) {
  const runner = onlyCaseId && onlyCaseId !== caseId ? test.skip : test
  runner(`[app-flows] [${caseId}] ${title}`, { timeout: 180_000 }, fn)
}

registerCase('e2e.app.toast.node-error', 'toast shown when node:error is emitted from failed job execution', async () => {
  const { app, page } = await launchAppForCase('toast-node-error')
  try {
    const campaign = await createCampaign(page, {
      name: 'E2E Toast Node Error',
      workflow_id: 'nonexistent-flow-for-toast-e2e',
    })
    assert.ok(campaign?.id)

    await enqueuePendingJob(page, {
      campaignId: campaign.id,
      workflowId: campaign.workflow_id,
      nodeId: 'core.loop',
      instanceId: 'video_loop',
      data: { source: 'e2e-toast' },
    })

    await page.getByText(/Flow for campaign .* not found/i).waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByText('video_loop').first().waitFor({ state: 'visible', timeout: 30_000 })
  } finally {
    await app.close()
  }
})

registerCase('e2e.app.wizard.upload-local-empty-files', 'wizard upload-local shows validation error on files step when empty', async () => {
  const { app, page } = await launchAppForCase('wizard-error-files-empty')
  try {
    await page.getByRole('button', { name: /new campaign/i }).click()
    await page.getByRole('button', { name: /upload from file/i }).waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: /upload from file/i }).click()

    const nameInput = page.getByPlaceholder('My Campaign')
    await nameInput.waitFor({ state: 'visible', timeout: 30_000 })
    await nameInput.fill('E2E Wizard Validation')

    await page.getByText('Files').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: /next/i }).click()

    await page.getByText('Upload Local Files').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: /next/i }).click()
    await page.getByText('Select at least one video file').waitFor({ state: 'visible', timeout: 30_000 })
  } finally {
    await app.close()
  }
})

registerCase('e2e.app.node.graceful-fail', 'node graceful-fail emits node:failed event without node:error crash', async () => {
  const { app, page } = await launchAppForCase('node-graceful-fail')
  try {
    const campaign = await createCampaign(page, {
      name: 'E2E Graceful Fail',
      workflow_id: 'upload-local',
      local_files: [],
    })
    assert.ok(campaign?.id)

    await enqueuePendingJob(page, {
      campaignId: campaign.id,
      workflowId: campaign.workflow_id,
      nodeId: 'core.file_source',
      instanceId: 'file_source_1',
      data: {},
    })

    const logs = await waitForLogMatch(
      page,
      campaign.id,
      (items) => items.some((entry) => entry.event === 'node:event:node:failed' && entry.instance_id === 'file_source_1'),
      30_000
    )

    assert.equal(
      logs.some((entry) => entry.event === 'node:event:node:failed' && entry.instance_id === 'file_source_1'),
      true
    )
    assert.equal(
      logs.some((entry) => entry.event === 'node:end' && entry.instance_id === 'file_source_1'),
      true
    )
    assert.equal(
      logs.some((entry) => entry.event === 'node:error' && entry.instance_id === 'file_source_1'),
      false
    )
  } finally {
    await app.close()
  }
})
